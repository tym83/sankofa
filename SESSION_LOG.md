# Session log — Sankofa (started 2026-11-12)

## Цель
Реализовать этап 0 дистрибутива Sankofa (бывш. Блэкнетес) по concept.ru.md: карточки, Griot, CLI `sankofa`, атлас, память объектов и `fetch`, credits, веб-музей, публичный кластер на чтение.

## Текущее состояние
- Репо ~/projects/sankofa, ветка feat/concept (без remote). Worktrees: ../sankofa-kuberoot (feat/kuberoot, Codex собирает дистрибутив на kuberoot + conformance), ../sankofa-factcheck (Codex, факт-чек, журнал content/ledger/codex.yaml), ../sankofa-factcheck-b (Claude-агент, content/ledger/claude.yaml).
- Стенд: tenant-sankofa в workshop; кластер museum (2 узла, роль ingress-nginx, cert-manager включён). Кубконфиг ~/.sankofa-stand/museum.kubeconfig, контекст kubernetes-super-admin@kubernetes-museum, helper hack/stand/env.sh (km).
- Образы: реестр на каждом узле localhost:5000 (hack/stand/registry.yaml); hack/stand/push.sh, hack/stand/deploy.sh (griot). Музей: dist/museum.tar (crane append на nginx-unprivileged), deploy/museum.yaml.
- Публично: http(s)://museum.sankofa.workshop.aenix.io — сертификат пока самоподписанный (выпуск Let's Encrypt заблокирован классификатором, ждёт пользователя). Посетитель: deploy/visitor.yaml + hack/stand/visitor-kubeconfig.sh (только чтение, APF).
- e2e: hack/e2e/addons.sh — 11/11 зелёные.

## Следующий шаг
Дождаться факт-чека двумя агентами, сверить журналы, слить в feat/concept, пересобрать griot и музей. Проверить результат Codex по kuberoot.

## Журнал
### 12.11 — старт
- Выбрано имя Sankofa, папка переименована, дизайн согласован с пользователем («ок делаем»).
- Проверено: go 1.26.5, kind есть, k3d/crane/controller-gen нет; workshop API отвечает.

### 12.11 — ядро
- Карточки, словарь TUI, CRD Card/Quest, Griot (синк карточек, запись истории, aggregated API, SAR), CLI tell/fetch/obituaries. Тесты зелёные.
- Запущены фоновые агенты: контент (~80 карточек + главы + медиа), веб-музей в стиле Snow Fall.
- Создан тенант sankofa и кластер museum.

### 12.11 вечер — стенд и e2e
- Griot, вебхуки, музей выкачены на museum; ingress через tenant-root (роль ingress-nginx у nodeGroup — узлы пересоздались, образы перезалиты).
- Kgotla: исправлен случай Namespace (в запросе namespace = имя). Credits: таймауты 12–15 с.
- e2e 11/11. Посетитель только читает.
- Пользователь: каждый факт — два агента × два независимых авторитетных источника.

### 12.11 ночь
- Ссылки без текста показывают заголовок карточки (Go: Set.Resolved; веб — у агента).
- pkg/pulse + Griot :8081/pulse (SSE), музей проксирует /pulse; веб-агенту отдано: «спуск сквозь века» в духе neal.fun/deep-sea, комната прослушивания, подписи к фото.
- README EN/RU, LICENSE (Apache-2.0), content/LICENSE (CC BY 4.0 — предложение, ждёт подтверждения).
- 15 рецептов жанров проходят kubepkg validate; полную установку проверять на kuberoot.
- Let's Encrypt для музея заблокирован классификатором — нужен ответ пользователя.

### 12.11 — итог
- Факт-чек двумя агентами (Codex + Claude) × два источника, сверка в три фазы: 933 факта, 492 выпали; слито (feat/reconcile).
- Музей: спуск сквозь века, комната прослушивания (живой /pulse), ночные карты-hero для глав без фото, превью для соцсетей.
- Дистрибутив kuberoot (Codex): 3 узла, подписанные обновления, 6 e2e, память пережила перезагрузку, conformance 462/462; слит (feat/kuberoot). Архив: ~/Downloads/sankofa-kuberoot-validation-2026-11-12.tar.gz.
- Лицензии подтверждены (Apache-2.0 / CC BY 4.0). Let's Encrypt — пользователь сказал «потом».
- Стенд: e2e аддонов 11/11.

### 2026-11-12 — Media brief
- Goal: fill all missing card images and chapter heroes v2, v3, v5, v6 with verified open-licensed historical or documentary media; preserve all prose.
- Working state: clean feat/media worktree; MEDIA.md governs this task. Existing media are outside the requested audit.
- Next: inspect individual source pages, record exact rights statements, download and resize images, lint and commit small batches.

### 2026-11-12 — Verified media, first batch
- Added and committed 12 card images with source-page rights quotations (343ecfb).
- Rejected no-notice publicity photographs and the Crafts manuscript scan (unclear first-publication rights); used an openly licensed portrait of editor Henry Louis Gates Jr. instead.
- Card prose and all non-media front matter verified unchanged against the starting revision. Git whitespace check passed.
- Go lint is building with GOCACHE under /tmp because the sandbox cannot write the normal Go cache.
- Next: finish remaining photographs and chapter heroes, inspect the images, and run final coverage and lint checks.

### 2026-11-12 — Media brief completed
- Added an image to all 43 cards that lacked media at b6293c5 and restored documentary heroes for v2, v3, v5 and v6. All 102 cards now contain media; all eight chapters have heroes.
- Opened each selected file's own source page and recorded exact rights wording in content/ledger/media.yaml (47 entries), with source revisions where available, licence URLs, verification date and SHA-256 hashes. Contextual photographs are explicitly identified in captions and ledger notes.
- Final visual review covered every added image. Replaced the Hurston filmstrip with a Van Vechten portrait and the low-resolution prison photograph with Gottlieb's portrait of Lead Belly performing. Cropped the Adlam photograph to the lettering, excluding the cover illustration. Replaced the Gannibal letter candidate with a CC BY-SA photograph of the Suyda outbuilding because the letter reproduction's rights rationale was insufficient.
- Validation: `GOCACHE=/tmp/sankofa-media-go-cache go run ./cmd/sankofa content lint content/cards` reports `102 cards OK`; `go test ./pkg/card ./content` passes with the same cache. `git diff --check` passes.
- Coverage/integrity audit: 43/43 card additions, 4/4 requested heroes, 47/47 matching ledger records and file hashes; all derivatives decode as JPEG, are at most 1600 pixels on the long edge and below 600,000 bytes. Total derivative size: 15,301,804 bytes. All card/chapter prose and every non-media field match b6293c5.
- Work committed in small signed-off semantic batches on feat/media, with one final Assisted-by trailer per commit. No push or publication performed. Independent licence re-check remains for the reviewer named in MEDIA.md.
- No open questions for this media task.

### 2026-11-12 — Roots brief started
- Goal: complete ROOTS.md in this worktree (feat/roots): about 50 documented artist ancestry entries, Russian translations/search aliases, connected museum-card endpoints, and two independent authoritative opened sources per link.
- Scope: ROOTS.md supersedes the older distribution task and worktree instructions for this task. No stand changes, push, or publication.
- Initial state: clean feat/roots; content/roots contains only the format README. Its explicit two-agent verification requirement governs research and cross-review.
- Next: research concrete links in batches, cross-review every retained link, lint the full content and graph, and commit signed-off semantic batches.

## Open questions — Roots
- None.

### 2026-11-12 — Roots research batches
- Rock batch: 14 entries researched and written. Pop batch: 13 entries researched and written. Extra batch: 10 entries researched and written, including Aquarium, Mumiy Troll and Mashina Vremeni.
- Evidence is recorded per link in content/ledger/roots-*.json. Search excerpts and inaccessible pages are not counted as opened evidence; direct HTTP retrieval is recorded when used.
- Independent cross-review underway. Initial six extra entries confirmed by a second agent against both sources.
- Kino's proposed reggae/post-punk path remains excluded: the examined interviews did not establish one adequately corroborated link. Other Russian entries use specific covers/collaboration or explicit songwriting testimony.
- Next: finish modern batch and all cross-reviews, verify complete graph, run lint/CLI/export and relevant Go checks, then commit logical batches.

### 2026-11-12 — Roots research and cross-review complete
- Added 50 artists with 50 concrete links, including all requested example artists and three Russian/Soviet bands. Every retained edge has two opened independent sources and a separate second-agent review of both sources and the Russian translation.
- Cross-review narrowed Swift, Cash and Libertines claims to what both sources establish. Aquarium now connects through the originally reggae song Vavilon, avoiding a later collaboration as the endpoint of an earlier cover. Replaced the inaccessible Dylan source with an independently opened academic publication.
- Four research ledgers and four review ledgers retain the evidence trail; review hashes bind the final English and Russian claims. Documented metadata conventions and corrected BTS formation year and Paul Simon birthplace.
- Relevant Go tests pass: ./pkg/roots, ./content, ./cmd/sankofa. Next: final lint, export/graph audit and CLI checks, then signed-off batch commits.

### 2026-11-12 — Roots final validation
- Content lint passes: 102 cards OK, including roots validation. Relevant Go tests pass for ./pkg/roots, ./content and ./cmd/sankofa.
- Export contains exactly 50 artists and 50 links; all 50 paths end at existing museum cards (11 distinct endpoints), with no cycles or missing references. Maximum path length is two edges.
- Verified all 86 review hashes (14 whole-file hashes and 72 claim/translation hashes), all research/review source URL pairs, distinct researcher/reviewer identities, and translated genres/Cyrillic aliases for every entry.
- CLI passes 100 lookups: every English artist name and one Cyrillic alias per artist. Listing has exactly 50 entries. Additional owner-example lookup for Pete Doherty and Russian Mumiy Troll path succeeds. Local CLI examples require --content content/cards because the default card loader uses the cluster.
- Validation counts saved in content/ledger/roots-validation.json; git diff --check passes. No Go code, museum cards, stand resources or public deployment changed.
- Next: commit four content batches and a final documentation/audit batch; do not push.

### 2026-11-12 — Roots completed
- Committed the reviewed catalog in four signed-off batches: 7e2a199 (rock), d98c283 (electronic/alternative), 23014f1 (pop/country), 9d1dbcd (Russian/blues/soul).
- Final documentation/audit commit records conventions, usable local CLI examples, all validation counts and this session journal. All ROOTS.md deliverables are complete; no open questions.
- Each commit uses an English feat(content) subject, sign-off and exactly one final Assisted-by trailer. No push or publication performed.

### 2026-11-12 — Roots deeper started
- Goal: execute ROOTS-DEEP.md in the current feat/roots-deep worktree, preserve existing links, document intermediate artists and typed borrowings, and deliver an exact new-edge ledger.
- Scope: ROOTS-DEEP.md supersedes the historical kuberoot worktree/task directions. No infrastructure, push, or publication.
- Initial state: clean worktree; 50 artist files with one link each. The roots README explicitly requires two independent agents to check every link against two opened sources, so research and independent cross-review will use agents.
- Next: research documented chains in disjoint batches; verify Paradise Circus against recording credits; cross-review, lint, graph-audit and commit logical content batches.

### 2026-11-12 — Roots deeper resumed
- Read ROOTS-DEEP.md, roots format and Russian translation/glossary rules. Existing session journal was already modified; preserve it.
- Resolve the brief's removal conflict by its final rule: preserve every existing link and add stronger formative links alongside it.
- README requires independent two-agent source checks; use disjoint research ownership and independent cross-review. Work stays in this worktree; no infrastructure changes.
- Next: extend all 50 artists, verify borrowed recordings, and audit exact new links against the baseline.

### 2026-11-12 — Jazz and art-rock chain drafted
- Added seven intermediate files and fourteen sourced edges: Television to the Velvet Underground, Coltrane and Ayler; Velvet Underground to Reed; Reed to doo-wop and Coleman; jazz musicians to documented apprenticeships and museum traditions.
- Each new edge has two opened sources; research notes are in roots-deep-jazz-research.json. Independent review requested before acceptance.
- Added interpolation as a distinct borrowing kind, requiring a nonblank description. Targeted roots tests pass with the existing temporary Go cache; the default laptop cache is outside writable roots.
- Paradise Circus investigation: community lists identify Simone's See-Line Woman, but the official Luther booklet identifies performers without a sample credit. Absence of a credit is not disproof. Continue seeking independent authoritative confirmation; do not invent a replacement sample.

### 2026-11-12 — Rock lineage and independent jazz review
- Updated sixteen existing rock artists and added eleven intermediate artists, with thirty-two new links and bilingual stories; all original claims retained. New Black intermediate files include direct museum-card links.
- Recorded opened evidence in roots-deep-rock-research.json. Independent pop review found duplicate underlying Maiden interview, an unverified Oasis transcript, and insufficiently precise Muddy Waters electrification sources; replaced those sources and narrowed Maiden wording.
- Independently opened both sources for all fourteen jazz/art-rock links. Recorded confirmed full-link hashes and evidence in roots-deep-jazz-review.json; narrowed Television/Coltrane and replaced Television/Velvet Underground source to support chronology.
- Reviewed interpolation validation change; GOCACHE=/tmp/sankofa-roots-rock-gocache go test ./pkg/roots passed.

### 2026-11-12 — Deeper catalog and independent review
- All four research batches are drafted: 44 intermediate artists and 110 proposed new links, while retaining all 50 original links.
- Primary independently opened and checked both sources for all 33 modern-batch edges, including downloaded sampling studies and MusicTech text. Reviewed translations, stories, and borrowing descriptions; recorded whole-link hashes in roots-deep-modern-review.json.
- Full go test ./... passes with GOCACHE=/tmp/sankofa-roots-go-cache. Interpolation and collaboration are distinct kinds; borrowed descriptions reject blank or whitespace-only English text.
- Cross-review is resolving source independence and over-broad claims before final ledger generation. No push or publication.

### 2026-11-12 — Deeper catalog final validation
- Final collection: 94 artists, 160 links, including 44 new artists and 110 new links. All 50 original targets, English/Russian claims and source lists are preserved against c82dc083797c141e16b5c403e43a09d77ee5cf4f.
- Independent second review passed for every new link; 223 whole-link hash assertions and all 94 bilingual story reviews match the final content. Fixed duplicated underlying interview sources and narrowed unsupported chronology during cross-review.
- Content lint: 102 cards OK. Full go test ./... passes. git diff --check passes.
- Export: 94 artists and 237 valid paths, ending at 13 museum cards, no cycles or missing references. Every original artist has an intermediate-artist path; longest paths range from two to six edges where documented.
- CLI: all 188 English-name/Cyrillic-alias lookups select the expected artist; listing contains 94 entries.
- Exact additions are in roots-deep-new.yaml; detailed validation and current file hashes are in roots-deep-validation.json. Paradise Circus remains unconfirmed, explicitly excluded and documented in roots-deep-unresolved.yaml; no alternative sample invented.
- Next: create signed-off logical commits with exactly one final Assisted-by trailer, then verify clean status. Do not push.

### 2026-11-12 — Deeper catalog committed
- Created signed-off logical commits: ee7b6bd (borrowing kinds and validation), 1e97c34 (jazz/art rock), 4d0118a (rock/blues), 9843915 (pop/soul/hip-hop), 9240715 (electronic/alternative/reggae).
- Final documentation/audit commit records the exact new-edge ledger, unresolved Paradise Circus research, validation results and this append-only journal.
- All deliverables are implemented and checked. The unconfirmed sample lead remains excluded under the evidence rule. No owner decision is required; no push or publication performed.
