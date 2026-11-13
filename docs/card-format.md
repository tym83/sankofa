# Card format

A card is a short piece of culture that makes a reader say "wow" and go further. It is not an encyclopedia entry: who or what it is, the main thing, the surprising moment, where to look next. Details are one search away.

Cards live in `content/cards/<id>.md` (English, primary). Translations sit next to them as `<id>.<lang>.md` (see "Translations" below).

```markdown
---
id: bridgetower
kind: person            # person genre place object language script instrument event media work myth comparison
title: George Bridgetower
wow: Beethoven's most famous violin sonata was written for him, not for Kreutzer.
years: [1778, 1860]     # [from] or [from, to]
places:                 # first place is the main atlas point
  - {name: Vienna, lat: 48.2082, lon: 16.3738}
zoom: 4                 # 1 centuries/Atlantic, 2 regions, 3 cities and genres, 4 people, 5 a single document or recording
era: v5                 # v0 Africa before, v1 Middle Passage, v2 resistance, v3 voices, v4 diaspora, v5 Harlem/Négritude (and earlier Europe), v6 civil rights, v7 Afrofuturism
books: [heirs]          # voices (their own words), archives (records of those who traded and ruled), heirs (diaspora, memory, art)
edition: both           # both | m | f ; m/f cards come in pairs sharing `pair`
genres: [classical]     # optional, ids of genre cards
further:
  - "Beethoven, Violin Sonata No. 9, Op. 47 — any recording"
sources:
  - {title: "Grove Music Online: Bridgetower, George", url: "https://..."}
media:                  # optional, public domain or open licence only
  - {type: image, file: bridgetower.jpg, caption: "...", credit: "...", license: "Public domain", url: "https://commons.wikimedia.org/..."}
dispute: ""             # set when a claim is contested; say what is disputed
---
The body: 40–140 words, a story, not a reference. Cross-references are
written [[zong]] or [[zong|the Zong massacre]] and must point to existing cards.
```

Rules:

- Every fact is backed by a source in `sources`: a primary source, or two independent reliable sources. No quote sites, no viral posts, no unattributed quotes.
- Contested claims are marked in `dispute`, and the body says that it is contested.
- Admiration, not stigma: start from what the person made or did. Do not hide uncomfortable topics either.
- No generalising: every card has a place and a time.
- `sankofa content lint content/` must pass.

# Chapter format

The web museum is a scrollytelling special project. Each era is a chapter in `content/chapters/<era>.md`:

```markdown
---
id: v1
title: The Middle Passage
kicker: 1500s–1860s · the Atlantic
years: [1501, 1866]
hero: {file: hero-v1.jpg, caption: "...", credit: "...", license: "Public domain", url: "https://..."}
places: [{name: Atlantic Ocean, lat: 10, lon: -30}]
cards: [equiano, zong, slavevoyages-names]   # the cards the chapter walks through, in order
---
Chapter text: short paragraphs, separated by blank lines. Each paragraph is one
scroll step. Use [[card-id]] links like in cards. 150–400 words in total.
```

Media files for cards and chapters live in `content/media/`.

## Genres and credit

- Genre cards (`kind: genre`) list the genres they grew from in `roots: [blues, gospel]`. This is the dependency graph `sankofa genre why/rdeps` walks and the order in which genre packages install.
- People whose work was taken or popularised by others without credit or pay get `tags: [uncredited]` and `genres: [...]`; `sankofa genre audit <genre>` shows them as undeclared dependencies.

# Translations

`content/cards/<id>.ru.md`:

```markdown
---
title: Джордж Бриджтауэр
wow: Самую знаменитую скрипичную сонату Бетховена написали для него, а не для Крейцера.
places: ["Вена", "Лондон"]          # same order as the card's places
further: ["Бетховен, Соната для скрипки № 9 ля мажор, соч. 47"]   # same order
captions: ["..."]                   # media captions, same order as media
credits: ["..."]                    # media credits, one per media item
licenses: ["общественное достояние"] # licence names, one per media item
dispute: "..."                      # only when the card has a dispute
---
Body in Russian, with every [[id|link]] of the original kept (link text translated).
```

Sources are not translated. Facts never differ from the original. The linter checks
that every link of the original survives and that list lengths match.

Chapters: `content/chapters/<id>.ru.md` with `title`, `kicker` and the body.
Quests: `content/quests/<name>.ru.yaml` with `title`, `prompt`, `choices`, `reveal`.

## Explainer cards

Genres, instruments, scripts and languages (`kind: genre | instrument | script | language`)
must first explain what the thing is — how it sounds or works, where and when it
arose, what it was for, its main forms and names — and only then tell the story
that makes it memorable, and finally where it came from and what grew out of it.
Up to 235 words.
