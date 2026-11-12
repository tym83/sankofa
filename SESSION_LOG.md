# Session log — Sankofa (started 2026-11-12)

## Цель
Реализовать этап 0 дистрибутива Sankofa (бывш. Блэкнетес) по concept.ru.md: карточки, Griot, CLI `sankofa`, атлас, память объектов и `fetch`, credits, веб-музей, публичный кластер на чтение.

## Текущее состояние
- Репо: ~/projects/sankofa (git, ветка feat/concept, remote нет). Go-модуль github.com/tym83/sankofa.
- Стенд: кластер workshop (`--kubeconfig ~/workshop.txt --context admin@workshop`). Тенант `sankofa` (tenant-root, квота 24 CPU/48Gi) создан 12.11; в нём Kubernetes `museum` (v1.35, 2× u1.large) — hack/workshop/*.yaml. Кубконфиг museum — секрет в tenant-sankofa (ещё не вытащен).
- Код: pkg/card, pkg/atlas, pkg/reader, pkg/history (SQLite + aggregated API history.sankofa.kuberoot.dev), cmd/griot, cmd/sankofa (content, dict, tell, fetch, obituaries), CRDs deploy/crds.
- Параллельно: агент контента (content/), агент веба (web/). Свои коммиты — только по путям, не git add -A.
- Образы: у gh нет write:packages — нужен `gh auth refresh -s write:packages` от пользователя, иначе реестр в тенанте.
- Решения: код пишет Claude в сессии; домена нет, работаем по IP; API-группа sankofa.kuberoot.dev.

## Следующий шаг
Дождаться museum Ready, вытащить кубконфиг, собрать образ griot (ko), манифесты deploy/griot, e2e память+fetch.

## Журнал
### 12.11 — старт
- Выбрано имя Sankofa, папка переименована, дизайн согласован с пользователем («ок делаем»).
- Проверено: go 1.26.5, kind есть, k3d/crane/controller-gen нет; workshop API отвечает.

### 12.11 — ядро
- Карточки, словарь TUI, CRD Card/Quest, Griot (синк карточек, запись истории, aggregated API, SAR), CLI tell/fetch/obituaries. Тесты зелёные.
- Запущены фоновые агенты: контент (~80 карточек + главы + медиа), веб-музей в стиле Snow Fall.
- Создан тенант sankofa и кластер museum.
