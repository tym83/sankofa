# Roots brief

Readers pick an artist or a band and see, link by documented link, how it
stands on Black traditions. Format: `content/roots/README.md`. Museum cards you
can end at: `ls content/cards/*.md` (genres: work-songs, spirituals, blues,
gospel, jazz, rhythm-and-blues, rock-n-roll, funk, reggae, hip-hop,
detroit-techno, chicago-house, highlife, afrobeat, samba; people and things
such as rosetta-tharpe, big-mama-thornton, amen-break, planet-rock,
crazy-blues, banjo, steelpan, talking-drums …).

Write about 50 artists, chosen for "wow" and for range, including the owner's
examples: Television, Metallica, Taylor Swift, Pete Doherty / The Libertines,
Oasis. Also e.g. The Beatles, The Rolling Stones, Led Zeppelin, Black Sabbath,
Elvis Presley, Bob Dylan, The Clash, The Police, Nirvana, Radiohead, Daft Punk,
Kraftwerk, Madonna, Eminem, Amy Winehouse, Adele, Ed Sheeran, Billie Eilish,
Johnny Cash, Dolly Parton, Iron Maiden, Red Hot Chili Peppers, The White
Stripes, Arctic Monkeys, Coldplay, ABBA, BTS, and a few Russian/Soviet artists
the Russian audience will know (only where the influence is documented, e.g.
Аквариум and reggae, Кино and post-punk/reggae, Мумий Тролль — check!).
Intermediate artists (Black Sabbath, The Beatles, Elvis…) are their own files
and other artists link to them with `root:<id>`; the last link of every chain
goes to `card:<id>`.

Facts: each link is ONE concrete, documented influence (a cover recorded, a
musician named as an influence in an interview, a band starting as a blues
band, a producer, a sample), stated plainly. At least two independent
authoritative sources per link that you actually opened (artist interviews in
established outlets, biographies, Rolling Stone/Guardian/NPR/BBC, academic or
museum pages, liner notes). Not fan wikis, not "everyone knows". If you cannot
document a link, do not write it. Prefer specific, surprising facts (who they
covered, what they sampled, who taught whom). Add a good Russian translation in
`claimRu`, `nameRu` where the Russian name differs, `genreRu`, and Cyrillic
`aliases` for search.

Check: `go run ./cmd/sankofa content lint content/cards` (validates roots too).
Commit in batches: `git commit --signoff`, English `feat(content): ...`, last
line exactly `Assisted-by: LLM`. Work only in this worktree. Do not push.
