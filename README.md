# Sankofa

*Go back and fetch what you left behind.* Sankofa is an Adinkra symbol of the
Akan people of Ghana: a bird that turns its head back to take an egg from its
own back.

Sankofa is a Kubernetes distribution that remembers, and a museum of seven
centuries of Black culture that ships inside it: from the libraries of
Timbuktu to the starships of Sun Ra. Every card in it is short, surprising and
sourced; every fact is checked by two independent agents against two
independent authoritative sources each.

Русская версия: [README.ru.md](README.ru.md).

## What it does for a cluster

| Feature | What it gives you | Inspired by |
|---|---|---|
| **Griot**, the memory | The life of every object, including after deletion: `sankofa tell deployment/web`, `kubectl get timelines`. Status and secret values are never stored; reading the memory follows RBAC. | The griot, keeper of oral history in West Africa |
| **Sankofa fetch** | Restore one object as it was at any moment: `sankofa fetch deployment/web --at 2h` | The Sankofa bird |
| **Kgotla** | Objects labelled `sankofa.kuberoot.dev/kgotla=protected` are deleted only after a council: every named voice has spoken, the chief spoke last. Names come from authentication. | The Tswana kgotla |
| **Polyrhythm** | Write `H` in a CronJob minute (`H 3 * * *`) and jobs take free beats instead of all starting at once. | West African 12/8 ensembles |
| **Credits** | `sankofa credits pod/x` walks an image's declared lineage; a webhook warns or refuses images that hide their base, source or licence. | "Hound Dog" was Big Mama Thornton's before it was Elvis's |
| **Story** | `sankofa story deployment/web` tells an incident in three books (events, changes, heirs) and points out where they disagree. | Pavić's *Dictionary of the Khazars* |
| **Pulse** | The cluster's heartbeat as a live stream; the museum plays it as a polyrhythm. | Call and response |

## What it gives a person

- `sankofa dict`: an endless dictionary in the terminal, in the manner of
  Pavić; links are marked with the book they lead to (❝ voices, ▤ archives,
  ✶ heirs); every installation holds a male or a female copy.
- `sankofa atlas`: a braille world map with a timeline; zoom is a level of
  generalisation, from five centuries of the Atlantic down to one document.
- `sankofa genre why|rdeps|audit hip-hop`: music as a dependency graph.
- `sankofa quest`: real dilemmas (no right answer: you learn what a real person
  chose and what it cost), quizzes and walks through the dictionary.
- `sankofa wait -- <command>`: a surprising line while a long command runs.
- The web museum: a scrollytelling special project with an atlas, a timeline
  and every card; every terminal link opens at the same point.

## Install as add-ons

```bash
kubectl apply -f deploy/crds/
kubectl apply -f deploy/griot.yaml      # replace the image reference first
kubectl apply -f deploy/webhooks.yaml
go install ./cmd/sankofa                # or: kubectl sankofa
```

The museum: `web/` (see [web/README](web/) and `web/Dockerfile`),
`deploy/museum.yaml`. A public read-only entrance for visitors:
`deploy/visitor.yaml`.

## Content

Cards live in `content/cards` ([format](docs/card-format.md)), chapters in
`content/chapters`, quests in `content/quests`. `sankofa content lint content/cards`
checks sources, links, coordinates and length.

## Tests

```bash
go test ./...
hack/e2e/addons.sh      # on a cluster: cards, memory, fetch, RBAC, Kgotla, Polyrhythm, Credits, visitor, museum
cd web && npm test && npm run e2e
```

## Licence

Code: Apache-2.0. Cards and chapters: CC BY 4.0. Media keep their own public
domain or open licences, credited on every card.
