# Roots

One file per artist or band: `<id>.yaml`. Each link is one documented step
to another artist (`root:<id>`) or a museum card (`card:<id>`), with at least
two independent authoritative sources. Both a researcher and a separate
reviewer open and check the sources. Two websites repeating the same
interview do not count as two independent sources.

The collection contains 94 artists and 160 links. The deeper edition adds
44 intermediate artists and 110 links, preserving all 50 original links,
their claims, translations and sources. Every original artist now has a
documented path through another artist to a museum tradition. Paths are
selected connections, not complete ancestry or a claim of exclusive influence.
In particular, a cover, sample or collaboration does not by itself prove
formative influence. Earlier cover links remain alongside stronger formative
links where the evidence supports them.

For people, `years` contains birth and, where applicable, death years. For
bands, the single year is formation, avoiding misleading uninterrupted
activity ranges. `place` is birthplace for people and formation city for bands.
Use Cyrillic aliases for Russian search and follow
[`TRANSLATION-RU.md`](../TRANSLATION-RU.md) and
[`GLOSSARY-RU.md`](../GLOSSARY-RU.md).

Each artist has `story` and `storyRu`: two or three sentences drawn only from
that file's own links. Do not introduce additional facts from a source or
silently infer influences from a downstream path. Intermediate Black artists
also have their own direct link to an appropriate museum card. A path reaching
a card can be followed further through that card's separate `roots` graph.

Every catalog link has a `kind`:

| Kind | What the evidence establishes |
| --- | --- |
| `influence` | A documented influence on the artist's music |
| `cover` | A new performance of another artist's song |
| `sample` | Reuse of an existing recording |
| `interpolation` | A newly played or sung part of an existing composition |
| `member` | Playing or singing in the linked artist's band |
| `producer` | Production or mixing work shaping the recording |
| `scene` | A documented musical community, practice or tradition |
| `teacher` | Direct musical instruction |
| `collaboration` | Joint performance or recording, without implying mentorship |

For covers, samples and interpolations, both `what` and `whatRu` identify
the song, recording where applicable, and borrowed part. For example,
Coldplay's `Talk` interpolates the synthesizer riff of Kraftwerk's
`Computer Love` on guitar; it does not reuse that recording. Keep that
distinction in both languages. The loader still accepts older optional
metadata, but validates recognized kinds and a nonblank English borrowing
description when a borrowing kind is set.

## Evidence and independent review

[`roots-deep-new.yaml`](../ledger/roots-deep-new.yaml) is the exact inventory
of added edges, generated against baseline commit
`c82dc083797c141e16b5c403e43a09d77ee5cf4f`. It includes the requested artist,
target, kind, claim and sources, plus translations and borrowing descriptions.

The four `roots-deep-{rock,pop,modern,jazz}-research.json` ledgers document
first checks. Matching `-review.json` ledgers record independent checks of
both sources. Their whole-link SHA-256 values bind the accepted kind,
descriptions, English/Russian claims and sources. Canonical encoding is UTF-8
JSON with sorted keys, unescaped Unicode and no separator whitespace. A
changed link needs renewed review. The validation report records current
artist-file hashes as well.

Earlier `roots-{rock,pop,modern,extra}.json`, matching review files and
[`roots-check.yaml`](../ledger/roots-check.yaml) remain historical evidence
for the original claims. Their old whole-file hashes apply to the baseline,
not to the expanded files. Original claims and sources are compared with
that baseline; new annotations and stories receive a separate review.

[`roots-deep-unresolved.yaml`](../ledger/roots-deep-unresolved.yaml) records
the unresolved `Paradise Circus` / Nina Simone lead. It is not an accepted
edge: community attributions and silence in a credits booklet cannot
establish or disprove the sample. Do not invent a replacement attribution.

## Validation

```sh
go run ./cmd/sankofa content lint content/cards
go test ./...
go run ./cmd/sankofa roots "Television" --content content/cards
go run ./cmd/sankofa roots "Мумий Тролль" --lang ru --content content/cards
go run ./cmd/sankofa content export content/cards -o /tmp/sankofa-content.json
```

`--content content/cards` selects local content instead of a cluster.
[`roots-deep-validation.json`](../ledger/roots-deep-validation.json) records
the final graph, baseline preservation, review-hash, export and bilingual
CLI checks. The earlier `roots-validation.json` describes only the original
50-artist edition.
