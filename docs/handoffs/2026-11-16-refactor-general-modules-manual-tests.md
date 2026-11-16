# Handoff: ручні перевірки рефакторингу «універсальні модулі»

2026-11-16 · сесія: старт → локальний запуск на тестовій БД → ручні test-cases 1–5 у Playwright → перевірка доступності OLX з хмари → закриття.
Попередній handoff — `docs/handoffs/2026-11-10-refactor-general-modules.md`.

## Objective

Пройти в браузері ручні test-cases 1–5 з `docs/plans/old/refactor-general-modules.md` на гілці PR #91; знайдений баг —
спершу тест, потім виправлення. Перевірити, чи OLX доступний із хмари.

## Current state (ви тут)

- Гілка `ccr-0b71569c-84hgso`, PR #91 (чернетка), у `main` не злито; код не змінювався — багів не знайдено.
- Змінено лише документацію (план, `current.md`, парковка P-022, цей хендоф).
- Прод не чіпали; усе локально на порожній `server/data/olx.db` (gitignored) з тестовими даними.

## Decisions (і чому)

- **Тестові дані сіяв скриптом, не копією проду** — людина: «локальна БД, не прод». Скрипт у scratchpad сесії (одноразовий).
- **Для «AI Вибір» додано 40 оголошень до другого пошуку** — агент: ZIP у цьому діалозі з'являється лише при пулі понад 50.
- **Попередження `validateDOMNesting` не виправляли** — агент: не пов'язане з PR (файл `AiHubStepCard.tsx` не змінювався),
  записано як P-022.

## Dead ends — не повторювати

- **`getByRole('button', {name: 'Запустити'})` без `exact`:** збігається і з кнопкою-карткою кроку (її підпис містить
  слово) — індекси «пливуть». Брати `exact: true` (3 кнопки: кроки 1, 2, 3).
- **Клік «Пошуки» перед вибором пошуку при повторному відкритті сторінки:** секція лишається розгорнутою, клік її
  згортає. Спершу перевіряти видимість пошуку.
- **ZIP/xlsx у майстрі «Плюси та мінуси»:** поле вставки з'являється лише після натискання «Завантажити ZIP-пакет»;
  «Далі: перевірка» неактивна, поки не додано відповідь (формат — `[{id, items:[{criterion, evidence}]}]`, `evidence` —
  підрядок опису).

## Artifacts

- Знімки й сирий звіт — у scratchpad сесії (`case1.png`…`case5.png`, `results.json`); у репозиторій не потрапили.
- Правки доків: `docs/plans/old/refactor-general-modules.md` (статус, уточнення test-case 4), `docs/current.md`, `docs/parking.md`.

## Verbatim essentials

| # | Кейс | Результат |
|---|---|---|
| 1 | «AI Фільтр релевантності»: обсяг | PASS — «Весь пошук (32)», «У таблиці · 29 (Вкладка "Всі")», «Вибрані (0)», «Найкращі кандидати (23)»; за замовчуванням «Весь пошук»; з позначеним рядком — «Вибрані (1)» |
| 2 | «Плюси та мінуси»: підпис обсягу | PASS — «Мінуси · Весь пошук (32)», «Мінуси · У таблиці…», «Плюси · У таблиці (Вкладка "Всі") (29)» |
| 3 | «AI Вибір»: обсяг | PASS — обрано лише «Найкращі кандидати» |
| 4 | Ручний режим → ZIP у трьох діалогах | PASS — `relevance-search-1.zip` (prompt.txt, merge.py, verify.py, descriptions/, classifications/); `analysis-cons-search-1.zip` (prompt.txt, analyze.py, patterns.example.json, descriptions/); `ai-picks-search-2.zip` (prompt.txt, candidates/, nominations/) |
| 5 | Експорт xlsx | PASS — `analysis-cons.xlsx`, відкривається, аркуш «Мінуси», шапка «Назва \| Опис \| Мінуси» |

- OLX з хмари: `POST https://www.olx.ua/apigateway/graphql`, пошук «iphone», `limit=1` → HTTP 200, `ListingSuccess`
  (`total_elements 1000`, `visible_total_count` ≈ 76 тис.) — GraphQL доступний.
- Єдине попередження консолі — `validateDOMNesting` (`<button>` у `<button>`, `AiHubStepCard`), існувало до PR → P-022.
- Не перевірено: тест-кейс 6 (404 неіснуючого пошуку) — покритий Vitest, з UI недосяжний.

## Open items

- **Next step:** людина вирішує про злиття PR #91 (= автодеплой) → `npm run smoke`.
- **Then:** фази 5–6 [refactor-clean-architecture](../plans/refactor-clean-architecture.md), парковка (P-019, P-020, P-018, P-022).

## Що змінилося в документації

- Парковка: P-022 · закриті: —
- Плани: статус `refactor-general-modules` доповнено результатом ручних перевірок; test-case 4 уточнено (ZIP у «AI Вибір» — лише при пулі понад 50)

## Suggested opening prompt

> Почни сесію (session-start). PR #91 (refactor-general-modules) пройшов ручні перевірки; скажи, чи зливати.
