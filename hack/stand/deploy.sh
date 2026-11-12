#!/usr/bin/env bash
# Build Griot, push it to the stand and roll it out.
set -euo pipefail
cd "$(dirname "$0")/../.."
source hack/stand/env.sh
img=$(hack/stand/push.sh griot ./cmd/griot 2>/dev/null | tail -1)
[[ $img == localhost:5000/* ]] || { echo "push failed" >&2; exit 1; }
mkdir -p dist
sed "s#ko://github.com/tym83/sankofa/cmd/griot#$img#" deploy/griot.yaml > dist/griot.yaml
km apply -f deploy/crds/ >/dev/null
km apply -f dist/griot.yaml >/dev/null
km apply -f deploy/webhooks.yaml >/dev/null
km -n sankofa-system rollout status deploy/griot --timeout=180s
echo "$img"
