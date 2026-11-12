# Phase 2 — re-check of contested claims

You did not confirm these claims in your own fact-check; the other agent did,
with two sources each. Re-check each claim yourself, independently: open the
other agent's sources AND look for your own second authoritative source (do
not accept two pages that copy each other). Verdict per claim:

- `confirmed` with your two sources (URLs you opened),
- `corrected` with the correct fact and two sources,
- `refuted` with the evidence,
- `unverified` if you cannot get two authoritative sources.

Do not reject a claim only because a single link is down if another
authoritative source exists. Write one YAML list to the file named in your
prompt, entries: `{card, claim, verdict, sources: [{title, url}, {title, url}], note}`.
Do not edit cards. Do not commit. Work only in `~/projects/sankofa-reconcile`.
