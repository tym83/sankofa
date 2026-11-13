# Independent check of the rewritten explainer cards

25 cards in content/cards (genres, instruments, scripts, languages) were
rewritten to explain what each thing is; the new claims and the writer's
sources are listed in content/ledger/explainers-new.yaml (155 claims). The
owner's rule: every fact is confirmed by two independent agents, each with two
independent authoritative sources. You are the second agent.

For every claim in explainers-new.yaml: check it yourself — open the writer's
sources and find your own second authoritative source (encyclopedias with named
experts, Grove/Oxford, Library of Congress, Smithsonian/NMAAHC, university and
museum pages, established newspapers; not fan wikis). Two pages copying each
other count as one. Verdict: confirmed | corrected | refuted | unverified.

Write content/ledger/explainers-check.yaml (card, claim, verdict, your two
sources, note). Then apply to the cards: corrected → fix the text; refuted or
unverified → remove the claim from the card (keep the prose grammatical and the
card still explaining what the thing is with what remains). Do not add facts.
Also check the places/coordinates the writer changed (first place = birthplace).

Check: `go run ./cmd/sankofa content lint content/cards` — errors only about
Russian files lagging are expected. Commit: `git commit --signoff`, English
`fix(content): ...`, last line exactly `Assisted-by: LLM`. Do not push.
