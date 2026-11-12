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
