# Session log — Sankofa (started 2026-11-12)

## Цель
Реализовать этап 0 дистрибутива Sankofa (бывш. Блэкнетес) по concept.ru.md: карточки, Griot, CLI `sankofa`, атлас, память объектов и `fetch`, credits, веб-музей, публичный кластер на чтение.

## Текущее состояние
- Репо: ~/projects/sankofa (git, ветка feat/concept, remote нет). Go-модуль github.com/tym83/sankofa.
- Стенд: кластер workshop (`KUBECONFIG=~/workshop.txt`, `--context admin@workshop`) доступен. Тенант `sankofa` ещё не создан.
- Решения: код пишет Claude в сессии; домена нет, работаем по IP; API-группа sankofa.kuberoot.dev.

## Следующий шаг
Скелет: api/v1alpha1 (Card, Quest), pkg/content (парсер карточек), первые карточки, `sankofa dict`.

## Журнал
### 12.11 — старт
- Выбрано имя Sankofa, папка переименована, дизайн согласован с пользователем («ок делаем»).
- Проверено: go 1.26.5, kind есть, k3d/crane/controller-gen нет; workshop API отвечает.
