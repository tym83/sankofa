#!/usr/bin/env bash
# Print the public, read-only kubeconfig of the museum cluster.
set -euo pipefail
cd "$(dirname "$0")/../.."
source hack/stand/env.sh
server=$(km config view --minify -o jsonpath='{.clusters[0].cluster.server}')
ca=$(km config view --minify --raw -o jsonpath='{.clusters[0].cluster.certificate-authority-data}')
token=$(km -n sankofa-museum get secret visitor-token -o jsonpath='{.data.token}' | base64 -d)
cat <<YAML
apiVersion: v1
kind: Config
clusters: [{name: sankofa-museum, cluster: {server: $server, certificate-authority-data: $ca}}]
users: [{name: visitor, user: {token: $token}}]
contexts: [{name: sankofa-museum, context: {cluster: sankofa-museum, user: visitor}}]
current-context: sankofa-museum
YAML
