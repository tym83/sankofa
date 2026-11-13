# Roots, deeper

Read content/roots/README.md (format, with the new `kind` and `what` fields)
and the existing 50 artists in content/roots/. The owner wants lineage, not
single facts: unwind each chain step by step, through the artists and scenes
in between, down to Black traditions — and show borrowings (covers, samples,
interpolations) as their own kind of link.

Example of the depth wanted: Television ← (scene/influence) The Velvet
Underground ← Lou Reed's documented influences (doo-wop; Ornette Coleman and
free jazz, which Reed named) → jazz; and Tom Verlaine's own Coltrane/Ayler
link. Another: samples — the owner remembers Massive Attack's "Paradise
Circus" using a Nina Simone recording's beat/handclaps: VERIFY this; if it is
wrong, find what the track actually samples, and don't write anything you
cannot document.

What counts (the owner's correction): a link must explain LINEAGE — how the
artist's music was formed out of the tradition — not trivia. "The Beatles
recorded 'Twist and Shout' after the Isley Brothers" is true but says nothing
about succession; useful are facts like: what repertoire the young band was
built on night after night (Hamburg/Cavern sets of American R&B and rock'n'roll),
who shaped a singer's style (e.g. a tour with Little Richard, what he showed
them), whose songwriting they modelled theirs on, which scene they grew out of,
what in their sound is taken from whom. Single covers and samples stay only
when they show formation or are a genuine "wow" (a track built on a Black
recording). Replace weak existing links with formative ones where you can
document them (you may remove a weak link if a better one replaces it).

Each artist file also gets `story` / `storyRu`: two or three sentences that
tell how this artist grew out of the tradition, built ONLY from the facts in
its own links (no new facts in the story).

Do:
1. For every existing artist add the intermediate steps that are documented
   (2–4 hops where real), as separate artist files (e.g. the-velvet-underground,
   lou-reed, the-stooges, mc5, chuck-berry, little-richard, muddy-waters,
   howlin-wolf, robert-johnson, ornette-coleman, john-coltrane, james-brown,
   lee-scratch-perry, king-tubby, nina-simone, marvin-gaye, aretha-franklin,
   prince …) — Black artists who are intermediate steps get their own files
   with a link to the right museum card.
2. Give every link a `kind`; for `cover` and `sample` fill `what`/`whatRu`
   precisely (which song, which recording, what part).
3. Add samples and covers people don't expect (that is the "wow"): rock and
   pop tracks built on Black recordings.
4. Keep every existing rule: one concrete fact per link, two independent
   authoritative sources you opened (not WhoSampled/Genius/fan wikis alone —
   they can only point you to a primary source), `claimRu` in good Russian
   (content/TRANSLATION-RU.md, content/GLOSSARY-RU.md), Cyrillic aliases.
5. Do not delete existing links; you may refine their `kind`.

Check: `go run ./cmd/sankofa content lint content/cards`. Commit in batches:
`git commit --signoff`, English `feat(content): ...`, last line exactly
`Assisted-by: LLM`. Work only in this worktree. Do not push. At the end list
every new link in content/ledger/roots-deep-new.yaml (artist, to, kind, claim,
sources) for the second checker.
