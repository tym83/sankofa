#!/usr/bin/env bash
# Build the museum (data + site), pack it onto nginx-unprivileged without a
# Docker daemon, push it to the stand and roll it out.
set -euo pipefail
cd "$(dirname "$0")/../.."
source hack/stand/env.sh
(cd web && sh scripts/build-data.sh >/dev/null && npx vite build >/dev/null)
rm -rf dist/museum-layer dist/museum-layer.tar dist/museum.tar
mkdir -p dist/museum-layer/usr/share/nginx/html dist/museum-layer/etc/nginx/conf.d
cp -R web/dist/. dist/museum-layer/usr/share/nginx/html/
cp web/nginx.conf dist/museum-layer/etc/nginx/conf.d/default.conf
(cd dist/museum-layer && COPYFILE_DISABLE=1 tar --uid 0 --gid 0 -cf ../museum-layer.tar .)
"$HOME/go/bin/crane" append --platform linux/amd64 -b nginxinc/nginx-unprivileged:1.29-alpine \
  -f dist/museum-layer.tar -t sankofa/museum:dev -o dist/museum.tar >/dev/null
img=$(hack/stand/push.sh museum dist/museum.tar 2>/dev/null | tail -1)
[[ $img == localhost:5000/* ]] || { echo "push failed" >&2; exit 1; }
sed -e "s#MUSEUM_IMAGE#$img#" -e "s#MUSEUM_HOST#${MUSEUM_HOST:-museum.sankofa.workshop.aenix.io}#g" deploy/museum.yaml > dist/museum.yaml
km apply -f dist/museum.yaml >/dev/null
km -n sankofa-museum rollout status deploy/museum --timeout=180s
echo "$img"
