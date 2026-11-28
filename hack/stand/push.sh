#!/usr/bin/env bash
# Build an image once and push it to the node-local registry on every node of
# the stand. Only for experiments with images CI does not publish (the Griot
# benchmark, hack/griot-bench): the museum, Griot and Angel are deployed from
# ghcr.io (ghcr_image in env.sh). Each registry replica keeps its images on
# its own volume (hack/stand/registry.yaml). Prints the digest reference:
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
# Push once from here to the first node's registry, then copy inside the
# cluster to the others: the laptop's uplink is the slow part, the cluster
# network is not. crane skips blobs a registry already has, so an unchanged
# layer (the museum's pictures) is not sent again.
read -ra pods <<<"$(km -n sankofa-registry get pods -l app=registry -o jsonpath='{range .items[*]}{.metadata.name}{" "}{.status.podIP}{"\n"}{end}' | sort | tr '\n' ' ')"
first=${pods[0]} firstip=${pods[1]}
port=15001
km -n sankofa-registry port-forward "pod/$first" "$port:5000" >/dev/null 2>&1 &
pf=$!
trap 'kill $pf 2>/dev/null || true' EXIT
for _ in $(seq 1 30); do curl -sf "http://localhost:$port/v2/" >/dev/null && break; sleep 0.5; done
ref=$(crane push --insecure "$tar" "localhost:$port/sankofa/$name:dev")
digest=${ref##*@}
for ((i = 2; i < ${#pods[@]}; i += 2)); do
  ip=${pods[$((i + 1))]}
  km -n sankofa-registry run "copy-$name-$RANDOM" --rm -i --quiet --restart=Never \
    --image=gcr.io/go-containerregistry/crane:v0.20.3 -- \
    copy --insecure "$firstip:5000/sankofa/$name@$digest" "$ip:5000/sankofa/$name:dev" >/dev/null
done
echo "localhost:5000/sankofa/$name@$digest"
