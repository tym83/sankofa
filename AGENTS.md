# Sankofa on kuberoot — brief for the implementing agent

You are turning Sankofa into a real kuberoot distribution, booting it on a
stand and proving it with end-to-end tests and upstream conformance. Work
autonomously. Ask the owner only when a decision is genuinely theirs: write
such questions into `SESSION_LOG.md` under "Open questions" and keep working.

## What Sankofa is

A Kubernetes distribution that is also a cultural monument to Black culture
(concept: `concept.ru.md`, Russian; card format: `docs/card-format.md`). Its
distribution-level features already exist as Go code in this repository and
already work as add-ons on an ordinary cluster (proven on the museum stand):

- `cmd/griot`: syncs cards and quests (CRDs in `deploy/crds`), records the life
  of every object into SQLite and serves it as the aggregated API
  `history.sankofa.kuberoot.dev` (timelines, obituaries; RBAC-following via
  SubjectAccessReview); also serves the admission webhooks Kgotla (council
  before deleting protected objects), Polyrhythm (`H` in CronJob minutes) and
  Credits (image lineage warnings). Manifests: `deploy/griot.yaml`,
  `deploy/webhooks.yaml`.
- `cmd/sankofa`: the CLI (dict, atlas, tell, fetch, obituaries, credits, genre,
  quest, kgotla, story, crumb, wait).

## Your task

1. A kuberoot distribution profile `sankofa`, built exactly the way Gachinetes
   does it (`~/projects/gachinetes`: `distro/kuberoot/gachinetes/{profile.py,
   addons/, extras.sh}`, `hack/kuberoot.sh`): edge profile as the base;
   `griot` and `sankofa` binaries installed into the node image; Griot runs as
   a node service on control-plane nodes (memory on the node's disk under
   `/var/lib/griot`), with the APIService and the webhooks pointing at it the
   way gachi-referee is wired (Service without selector + Endpoints, or URL
   webhooks to the node IP — pick what kuberoot supports cleanly). CRDs and RBAC
   as addons. No container registry needed for Sankofa's own components.
2. Boot it on the stand (below) with `hack/kuberoot.sh` from this repo, three
   nodes.
3. End-to-end tests in `hack/e2e/` that prove on that stand: cards are in the
   cluster and `sankofa dict --plain` reads them; delete a Deployment and
   `sankofa fetch` brings it back; `kubectl get timelines` follows RBAC (a user
   without rights to a namespace cannot read its memory); Kgotla blocks deleting
   a protected namespace until every voice spoke and the chief spoke last;
   `H 3 * * *` CronJobs land on different minutes; Credits warns in a labelled
   namespace. Each test must actually fail when the mechanism is broken.
4. Upstream conformance (Sonobuoy or Hydrophone, official image pinned by
   digest) with Sankofa installed: **462/462**. Record exact numbers and keep
   artefacts. If the memory recorder or a webhook breaks a conformance test,
   fix the mechanism, never skip the test.
5. `docs/kuberoot.md` (English) and `docs/kuberoot.ru.md`: how to build, boot
   and test the distribution.

## Stand

- Workshop cluster: `--kubeconfig ~/workshop.txt --context admin@workshop` on
  every kubectl call. Tenant `sankofa` already exists (`tenant-sankofa`, quota
  24 CPU / 48Gi). It already holds the nested Kubernetes `museum` (two
  `u1.large` nodes) and its node-local registry: **do not touch them**, they are
  the public museum. Your VMs and builder go into `tenant-sankofa` too; if the
  quota is not enough, write an open question instead of raising it.
- Do not modify or delete anything outside your own VMs/builder in
  `tenant-sankofa`. Never touch other tenants or cluster-wide objects.
- Heavy builds run in the cluster builder, not on this laptop.

## Rules

- Work in this worktree (`~/projects/sankofa-kuberoot`, branch `feat/kuberoot`).
  Another agent works on `feat/concept` in `~/projects/sankofa`; do not touch
  that directory. You may change Go code if the distribution needs it; keep
  changes minimal and tested (`go test ./...` green).
- Commits: small, logical, English semantic messages, `git commit --signoff`,
  exactly one trailer line `Assisted-by: LLM`; no other trailers, no
  Co-Authored-By, no tool or model names anywhere. Do not push. Do not publish
  anything.
- `SESSION_LOG.md` first (gitignored is fine): goal, current state, next
  step, append-only journal. Update it after every significant step.
- Never write secrets into the repository.
- Code, comments and docs in English.
