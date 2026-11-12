#!/usr/bin/env bash
# End-to-end proof of Sankofa installed as add-ons, on the museum stand.
# Every check fails loudly if its mechanism is broken.
set -euo pipefail
# has PATTERN: read all of stdin first, so an early grep exit never trips pipefail.
has() { local out; out=$(cat); grep -q -- "$1" <<<"$out"; }
cd "$(dirname "$0")/../.."
source hack/stand/env.sh
go build -o bin/sankofa ./cmd/sankofa
export SANKOFA_HOME=$(mktemp -d)
S() { ./bin/sankofa --kubeconfig "$MUSEUM_KUBECONFIG" --context "$MUSEUM_CONTEXT" "$@"; }
pass=0
ok() { pass=$((pass + 1)); echo "ok $pass - $*"; }
fail() { echo "FAIL - $*" >&2; exit 1; }
ns=sankofa-e2e-$RANDOM
cleanup() {
  km label ns "$ns" sankofa.kuberoot.dev/kgotla- >/dev/null 2>&1 || true
  km delete ns "$ns" --wait=false >/dev/null 2>&1 || true
  km delete kgotla -l sankofa-e2e=1 >/dev/null 2>&1 || true
}
trap cleanup EXIT
km create ns "$ns" >/dev/null

# Cards
n=$(km get cards --no-headers | wc -l)
[ "$n" -ge 50 ] || fail "only $n cards in the cluster"
ok "$n cards are in the cluster"
S dict bridgetower --plain | has Bridgetower || fail "dict cannot read a card"
ok "sankofa dict reads cards from the cluster"

# Memory and fetch
km -n "$ns" create deployment web --image=registry.k8s.io/pause:3.10 >/dev/null
sleep 3
km -n "$ns" scale deployment web --replicas=2 >/dev/null
sleep 3
km -n "$ns" delete deployment web >/dev/null
sleep 4
S -n "$ns" tell deployment/web | has "It died" || fail "Griot does not remember the death"
ok "Griot tells the life of a deleted Deployment"
S -n "$ns" fetch deployment/web >/dev/null
[ "$(km -n "$ns" get deploy web -o jsonpath='{.spec.replicas}')" = 2 ] || fail "fetch did not restore the last state"
ok "sankofa fetch brings the Deployment back with 2 replicas"

# Memory follows RBAC
km -n "$ns" create sa outsider >/dev/null
tok=$(km -n "$ns" create token outsider)
kc=$(mktemp)
server=$(km config view --minify -o jsonpath='{.clusters[0].cluster.server}')
ca=$(km config view --minify --raw -o jsonpath='{.clusters[0].cluster.certificate-authority-data}')
printf 'apiVersion: v1\nkind: Config\nclusters: [{name: c, cluster: {server: %s, certificate-authority-data: %s}}]\nusers: [{name: u, user: {token: %s}}]\ncontexts: [{name: c, context: {cluster: c, user: u, namespace: %s}}]\ncurrent-context: c\n' "$server" "$ca" "$tok" "$ns" > "$kc"
if ./bin/sankofa --kubeconfig "$kc" tell deployment/web >/dev/null 2>&1; then fail "a user without rights read the memory"; fi
ok "the memory is hidden from a user who cannot get the object"

# Kgotla
km label ns "$ns" sankofa.kuberoot.dev/kgotla=protected >/dev/null
if km delete ns "$ns" --wait=false >/dev/null 2>&1; then fail "protected namespace deleted without a council"; fi
ok "Kgotla blocks deleting a protected namespace"
for u in ama naledi; do km -n "$ns" create sa $u >/dev/null; done
km create rolebinding kgotla-voices -n "$ns" --clusterrole=edit --serviceaccount="$ns:ama" --serviceaccount="$ns:naledi" >/dev/null
km create clusterrolebinding "kgotla-voices-$ns" --clusterrole=sankofa:kgotla --serviceaccount="$ns:ama" --serviceaccount="$ns:naledi" >/dev/null
council=$(S kgotla call "namespace/$ns" --voices "system:serviceaccount:$ns:ama" --chief "system:serviceaccount:$ns:naledi" --reason e2e | sed -n 's/^Council \([^ ]*\) is called.*/\1/p')
km label kgotla "$council" sankofa-e2e=1 >/dev/null
speak() {
  t=$(km -n "$ns" create token "$1"); f=$(mktemp)
  sed "s#token: .*}}]#token: $t}}]#" "$kc" > "$f"
  ./bin/sankofa --kubeconfig "$f" kgotla speak "$council"
}
speak naledi | has "spoke as system:serviceaccount:$ns:naledi" || fail "speaker name is not from authentication"
if km delete ns "$ns" --wait=false >/dev/null 2>&1; then fail "deleted while the council still listens"; fi
speak ama >/dev/null
if km delete ns "$ns" --wait=false >/dev/null 2>&1; then fail "deleted before the chief spoke last"; fi
speak naledi | has "has decided" || fail "council did not decide"
ok "Kgotla: everyone spoke, the chief spoke last, the council decided"
km delete clusterrolebinding "kgotla-voices-$ns" >/dev/null

# Polyrhythm
for j in a b c; do km -n "$ns" create cronjob "$j" --image=registry.k8s.io/pause:3.10 --schedule="H 3 * * *" >/dev/null 2>&1; done
mins=$(km -n "$ns" get cronjobs -o jsonpath='{range .items[*]}{.spec.schedule}{"\n"}{end}' | awk '{print $1}' | sort -u | wc -l)
[ "$mins" -eq 3 ] || fail "H schedules did not spread: $mins distinct minutes"
ok "Polyrhythm spreads three H 3 * * * jobs over three minutes"

# Credits
km label ns "$ns" sankofa.kuberoot.dev/credits=warn --overwrite >/dev/null
km -n "$ns" run credits --image=registry.k8s.io/pause:3.10 2>&1 | has "Hound Dog" || fail "no credits warning"
ok "Credits warns about an image without declared licences"

# Visitor is read-only
vk=$(mktemp)
hack/stand/visitor-kubeconfig.sh > "$vk"
kubectl --kubeconfig "$vk" get cards >/dev/null || fail "visitor cannot read cards"
if kubectl --kubeconfig "$vk" delete card bridgetower >/dev/null 2>&1; then fail "visitor deleted a card"; fi
if kubectl --kubeconfig "$vk" get secrets -A >/dev/null 2>&1; then fail "visitor read secrets"; fi
ok "the public visitor reads cards and cannot write or read secrets"

# Museum
code=$(curl -sk -o /dev/null -w '%{http_code}' https://museum.sankofa.workshop.aenix.io/)
[ "$code" = 200 ] || fail "museum answered $code"
cards=$(curl -sk https://museum.sankofa.workshop.aenix.io/data/cards.json | python3 -c 'import json,sys;print(len(json.load(sys.stdin)["cards"]))')
[ "$cards" -ge 50 ] || fail "museum serves only $cards cards"
ok "the museum is public and serves $cards cards"

echo "all $pass checks passed"
