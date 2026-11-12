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
