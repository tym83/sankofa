# Roots

One file per artist or band: `<id>.yaml`. Each link is one documented step of
influence, to another artist here (`root:<id>`) or to a museum card
(`card:<id>`), and carries at least two independent authoritative sources.
Every link is checked by two agents, each against two sources; a link that is
not confirmed by both is dropped.

The current collection contains 50 artists and 50 documented links. Each link
records one example; a path does not claim to describe an artist’s entire
musical ancestry. Covers establish a recorded connection, not necessarily a
formative influence.

For people, `years` contains birth and, where applicable, death years. For
bands, the single year is formation, avoiding misleading uninterrupted
activity ranges. `place` is birthplace for people and formation city for bands.
Cyrillic aliases support Russian search.

Research notes are in `../ledger/roots-{rock,pop,modern,extra}.json`; matching
`-review.json` files record independent second-agent checks against both
sources. SHA-256 hashes bind each review to the English and Russian claim.
A changed claim needs renewed review. Validation counts are recorded in
[`roots-validation.json`](../ledger/roots-validation.json).

Example (also stored in `oasis.yaml`):

```yaml
id: "oasis"
name: "Oasis"
nameRu: "Oasis"
aliases: ["оазис", "Лиам Галлахер", "Ноэл Галлахер"]
years: [1991]
place: {"name": "Manchester", "lat": 53.4808, "lon": -2.2426}
genre: "Britpop"
genreRu: "брит-поп"
links:
  - to: "root:the-beatles"
    claim: "Oasis included their cover of the Beatles’ “I Am the Walrus” on The Masterplan."
    claimRu: "Oasis включили свою версию песни The Beatles «I Am the Walrus» в сборник The Masterplan."
    sources:
      - title: "Apple Music: The Masterplan — editorial album notes"
        url: "https://music.apple.com/us/album/the-masterplan/1517453693"
      - title: "Pitchfork: Oasis — The Masterplan"
        url: "https://pitchfork.com/reviews/albums/5930-the-masterplan/"
```

Validate and try the collection:

```sh
go run ./cmd/sankofa content lint content/cards
go run ./cmd/sankofa roots "Metallica" --content content/cards
go run ./cmd/sankofa roots "Мумий Тролль" --lang ru --content content/cards
go run ./cmd/sankofa content export content/cards -o /tmp/sankofa-content.json
```
