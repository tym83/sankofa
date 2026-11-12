# Media brief

Many cards in `content/cards/*.md` have no `media`, and chapters v2, v3, v5, v6
in `content/chapters/` have no `hero`. A museum without images feels like a
template. Find one strong image for each card without media and a hero for
each of those chapters.

What counts: real photographs, scans of manuscripts, first editions, prints,
maps, objects in museum collections — things people made or did (admiration,
not stigma). No modern illustrations, no AI images, no stock.

Licence: only public domain or an open licence (CC0, CC BY, CC BY-SA), and you
must have opened the file's own source page (Wikimedia Commons file page,
Library of Congress item, NYPL, Met/Rijksmuseum/Smithsonian open access, NARA,
national libraries) and seen the licence statement there. Record in the card
exactly: `{type: image, file, caption, credit, license, url}` where `url` is
that source page. If Commons only says "PD" with a weak rationale (e.g.
"no notice" publicity photos) or the author is unknown and the date is recent,
skip it. A second agent will independently re-check every licence.

Files go into `content/media/` (resize with `sips -Z 1600`, keep each under
~600 KB; use standard Commons thumbnail widths to avoid HTTP 429). Captions
state only what the source page states. Do not change any card text.

Also write `content/ledger/media.yaml`: one entry per added image with card,
file, url, license, and the exact licence wording you saw.

Check: `go run ./cmd/sankofa content lint content/cards`. Commit in small
batches: `git commit --signoff`, English `feat(content): ...`, last line
exactly `Assisted-by: LLM`. Work only in this worktree. Do not push.
