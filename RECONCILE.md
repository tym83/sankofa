# Reconciliation brief

Two independent agents fact-checked the same 102 cards and 8 chapters (the
originals are in this worktree, at the commit before either check):

- Agent A (codex): `~/projects/sankofa-factcheck` — ledger
  `content/ledger/codex.yaml`, report `content/FACTCHECK-REPORT.md`, edited
  cards in `content/cards`.
- Agent B (claude): `~/projects/sankofa-factcheck-b` — ledger
  `content/ledger/claude.yaml`, edited cards in `content/cards`.

The owner's rule: **a fact stays only if both agents confirmed it, each with two
independent authoritative sources.**

The owner's other rule: the museum must make people say "wow" — short,
surprising, admiring stories (40–130 words), not cautious reference entries.
Agent A removed many claims not because they were false but because of an
inaccessible link, "unnecessary precision" or length. Those are not
refutations.

## Phase 1 — match claims (write `content/ledger/match.yaml`)

For every card and chapter, list each factual claim of the ORIGINAL text and
its status in both ledgers:

- `agreed`: confirmed (or corrected to the same fact) by both, with their
  sources.
- `refuted`: either agent found it false or materially wrong (give the
  evidence). It is dropped or replaced by the corrected fact if both agree on
  the correction.
- `contested`: one confirmed with two sources, the other removed or left it
  unverified without refuting it. Record both reasons and the confirming
  agent's sources.
- `disputed`: either marked it disputed; it may stay only as an explicitly
  contested claim with `dispute` set.

## Phase 2 — (done by others) contested claims are re-checked by the agent
that did not confirm them, using the other's sources. Stop after Phase 1 and
report; you will be given the result.

## Phase 3 — write the final cards (only when told)

Rules for each final card: only `agreed` facts (and contested facts confirmed
in phase 2); every fact keeps two sources (merge both agents' best sources,
working URLs); keep the original "wow" hook if its fact survived, otherwise
find the most surprising surviving fact; 40–130 words; keep [[links]] valid;
media only with verified licences (take agent A's licence checks). Run
`go run ./cmd/sankofa content lint content/cards`.

Work only in `~/projects/sankofa-reconcile` (branch `feat/reconcile`).
Commits: `git commit --signoff`, English, last line exactly `Assisted-by: LLM`.
No push.
