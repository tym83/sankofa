#!/usr/bin/env bash
# Build an image once and push it to the node-local registry on every node of
# the stand. Prints the digest reference to use in manifests:
#   localhost:5000/sankofa/<name>@sha256:...
#
#   hack/stand/push.sh griot ./cmd/griot          # a Go command, built with ko
#   hack/stand/push.sh museum web/museum.tar      # a ready image tarball
set -euo pipefail
cd "$(dirname "$0")/../.."
source hack/stand/env.sh
export PATH="$HOME/go/bin:$PATH"
name=$1 src=$2
mkdir -p dist
tar=dist/$name.tar
if [[ $src == ./* && -d $src ]]; then
  KO_DOCKER_REPO=localhost:5000/sankofa ko build --bare --platform=linux/amd64 --push=false --tarball="$tar" "$src" >/dev/null
else
  tar=$src
fi
digest=""
port=15000
for pod in $(km -n sankofa-registry get pods -l app=registry -o name); do
  port=$((port + 1))
  km -n sankofa-registry port-forward "$pod" "$port:5000" >/dev/null 2>&1 &
  pf=$!
  for _ in $(seq 1 30); do curl -sf "http://localhost:$port/v2/" >/dev/null && break; sleep 0.5; done
  ref=$(crane push --insecure "$tar" "localhost:$port/sankofa/$name:dev" 2>/dev/null)
  kill $pf
  d=${ref##*@}
  if [[ -n $digest && $d != "$digest" ]]; then echo "digest differs between nodes: $digest vs $d" >&2; exit 1; fi
  digest=$d
done
echo "localhost:5000/sankofa/$name@$digest"
