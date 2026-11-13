#!/usr/bin/env bash
# Run from the builder, with a kubeconfig for our nested distribution.
set -euo pipefail
: "${SANKOFA_KUBECONFIG:?set the nested distribution kubeconfig}"
: "${SANKOFA_CONTEXT:?set the nested distribution context}"
[[ $SANKOFA_CONTEXT != admin@workshop ]] || { echo 'Refusing the workshop context' >&2; exit 1; }
ROOT=$(cd "$(dirname "$0")/../.." && pwd)
OUT=${CONFORMANCE_OUT:-/work/results/conformance-$(date -u +%Y%m%dT%H%M%SZ)}
mkdir -p "$OUT"
KUBECTL=${KUBECTL:-kubectl}
HYDROPHONE=${HYDROPHONE:-hydrophone}
PARALLEL=${CONFORMANCE_PARALLEL:-4}
[[ $PARALLEL =~ ^[1-9][0-9]*$ ]] || { echo "Invalid CONFORMANCE_PARALLEL" >&2; exit 1; }
k() { "$KUBECTL" --kubeconfig "$SANKOFA_KUBECONFIG" --context "$SANKOFA_CONTEXT" "$@"; }
# Pin the official multi-architecture index, verified against the registry.
IMAGE=registry.k8s.io/conformance@sha256:d503a15722ea23662c482b72ce01ee6e9efec1e8b9c2d3834aa0c51bb2d0832a
k get namespace sankofa-system > "$OUT/sankofa-namespace.txt"
k get nodes -o json > "$OUT/nodes.json"
k get apiservice v1alpha1.history.sankofa.kuberoot.dev -o json > "$OUT/apiservice.json"
k get validatingwebhookconfiguration sankofa-validating -o json > "$OUT/validating.json"
k get mutatingwebhookconfiguration sankofa-mutating -o json > "$OUT/mutating.json"
k version -o json > "$OUT/version.json"
python3 - "$OUT" <<'PY'
import json,sys,pathlib
p=pathlib.Path(sys.argv[1])
n=json.loads((p/'nodes.json').read_text())['items']
assert len(n)==3 and all(any(c['type']=='Ready' and c['status']=='True' for c in x['status']['conditions']) for x in n)
a=json.loads((p/'apiservice.json').read_text())
assert any(c['type']=='Available' and c['status']=='True' for c in a['status']['conditions'])
v=json.loads((p/'version.json').read_text())['serverVersion']['gitVersion']
assert v=='v1.37.2', 'conformance image must match server: '+v
for f in ('validating.json','mutating.json'):
    assert all(h['clientConfig'].get('caBundle') for h in json.loads((p/f).read_text())['webhooks'])
PY
printf '%s\n' "$IMAGE" > "$OUT/image.txt"
"$HYDROPHONE" --version > "$OUT/hydrophone-version.txt"
# Hydrophone has no context flag: produce a private, single-context config
# outside the evidence directory, and always delete it on exit.
config=$(mktemp)
chmod 600 "$config"
trap 'rm -f "$config"' EXIT
k config view --minify --flatten --raw > "$config"
set +e
"$HYDROPHONE" --kubeconfig "$config" --conformance --conformance-image "$IMAGE" \
  --parallel "$PARALLEL" --output-dir "$OUT" 2>&1 | tee "$OUT/hydrophone.log"
status=${PIPESTATUS[0]}
set -e
printf '%s\n' "$status" > "$OUT/exit-status.txt"
python3 "$ROOT/hack/e2e/check-conformance.py" "$OUT"
[[ $status = 0 ]]
