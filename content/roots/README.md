# Roots

One file per artist or band: `<id>.yaml`. Each link is one documented step of
influence, to another artist here (`root:<id>`) or to a museum card
(`card:<id>`), and carries at least two independent authoritative sources.
Every link is checked by two agents, each against two sources; a link that is
not confirmed by both is dropped.

```yaml
id: oasis
name: Oasis
nameRu: Oasis
aliases: [оазис]
years: [1991, 2009]
place: {name: Manchester, lat: 53.4808, lon: -2.2426}
genre: Britpop
genreRu: брит-поп
links:
  - to: root:the-beatles
    claim: "Noel Gallagher has called the Beatles the band that made him want to write songs."
    claimRu: "..."
    sources:
      - {title: "...", url: "https://..."}
      - {title: "...", url: "https://..."}
```
