# Source me: km is kubectl for the museum cluster of the stand.
MUSEUM_KUBECONFIG=${MUSEUM_KUBECONFIG:-$HOME/.sankofa-stand/museum.kubeconfig}
MUSEUM_CONTEXT=${MUSEUM_CONTEXT:-kubernetes-super-admin@kubernetes-museum}
km() { kubectl --kubeconfig "$MUSEUM_KUBECONFIG" --context "$MUSEUM_CONTEXT" "$@"; }
