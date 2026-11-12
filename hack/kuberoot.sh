#!/usr/bin/env bash
# Build and boot Sankofa using kuberoot's own workshop workflow.
# Commands: builder, build amd64, media amd64 [args], node sankofa-N amd64,
# console sankofa-N, sync, test, sh [command]. Heavy work stays in the builder.
set -euo pipefail
ROOT=$(cd "$(dirname "$0")/.." && pwd)
SRC=${KUBEROOT_SRC:-$ROOT/../kuberoot}
REF=${KUBEROOT_REF:-d6cb25699ba3e22fa1f8e707cd131c7409aa68dc}
export KUBECONFIG_WORKSHOP=${KUBECONFIG_WORKSHOP:-$HOME/workshop.txt}
export KUBE_CONTEXT=${KUBE_CONTEXT:-admin@workshop}
export KUBEROOT_NS=tenant-sankofa
k() { kubectl --kubeconfig "$KUBECONFIG_WORKSHOP" --context "$KUBE_CONTEXT" -n tenant-sankofa "$@"; }
b() { k exec -i sankofa-builder -c tools -- "$@"; }
case ${1:-} in
  builder) k apply -f "$ROOT/distro/kuberoot/sankofa/builder.yaml"; exit ;;
  node|console) [[ ${2:-} =~ ^sankofa-[a-z0-9-]+$ ]] || { echo 'Node names must start with sankofa-' >&2; exit 1; } ;;
  build|media) [[ ${2:-} = amd64 || ${2:-} = arm64 ]] || { echo 'Expected amd64 or arm64' >&2; exit 1; } ;;
  sync|test|sh) ;;
  *) echo 'Usage: hack/kuberoot.sh builder|build ARCH|media ARCH [args]|node sankofa-N ARCH|console sankofa-N|sync|test|sh [command]' >&2; exit 1 ;;
esac
if [[ $1 = node ]]; then
  [[ ${3:-} = amd64 || ${3:-} = arm64 ]] || { echo 'Expected amd64 or arm64' >&2; exit 1; }
fi
if [[ ${1:-} = build || ${1:-} = test ]]; then
  (cd "$ROOT" && git ls-files -co --exclude-standard -z |
    COPYFILE_DISABLE=1 tar --null -T - -czf -) |
    b sh -c 'mkdir -p /work/src/sankofa.new && tar -xzf - -C /work/src/sankofa.new && rm -rf /work/src/sankofa && mv /work/src/sankofa.new /work/src/sankofa'
  if [[ $1 = test ]]; then
    b sh -c 'cd /work/src/sankofa && go test ./...'
    exit
  fi
  b sh -c "set -e; cd /work/src/sankofa; mkdir -p /work/out/$2/sankofa; CGO_ENABLED=0 GOOS=linux GOARCH=$2 go build -trimpath -ldflags='-s -w' -o /work/out/$2/sankofa/ ./cmd/griot ./cmd/sankofa"
fi
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT
printf 'kuberoot source: %s\n' "$(git -C "$SRC" rev-parse "$REF")" >&2
git -C "$SRC" archive "$REF" | tar -x -C "$work"
git -C "$work" init -q
d="$work/distros/sankofa"
mkdir -p "$d/addons"
python3 "$ROOT/distro/kuberoot/sankofa/profile.py" "$work/distros/edge/profile.yaml" > "$d/profile.yaml"
cp "$work"/distros/edge/addons/* "$ROOT"/distro/kuberoot/sankofa/addons/* "$d/addons/"
cp "$ROOT"/deploy/crds/*.yaml "$d/addons/"
cp "$ROOT/deploy/webhooks.yaml" "$d/addons/50-webhooks.yaml"
cp "$ROOT/distro/kuberoot/sankofa/extras.sh" "$d/"
# Adapt only the disposable archive, never the reference checkout.
python3 - "$work" <<'PY'
import pathlib, sys
root=pathlib.Path(sys.argv[1])
p=root/'hack/hetzner.sh'
s=p.read_text().replace('exec -i builder ', 'exec -i sankofa-builder ').replace('exec -it builder ', 'exec -it sankofa-builder ')
s=s.replace('get pod builder ', 'get pod sankofa-builder ')
s=s.replace('kubectl --context "$CTX"', 'kubectl --kubeconfig "$KUBECONFIG" --context "$CTX"')
p.write_text(s)
p=root/'hack/hetzner/node.yaml'
s=p.read_text().replace('http://builder.', 'http://sankofa-builder.').replace('cpu: 4','cpu: 1').replace('memory: 8Gi','memory: 4Gi')
p.write_text(s)
PY
KUBEROOT_DISTRO=sankofa "$work/hack/hetzner.sh" "$@"
