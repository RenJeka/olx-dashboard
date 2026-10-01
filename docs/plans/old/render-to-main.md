# План: переведення Render на `main` з бекапом прод-БД

> **Статус:** ✅ виконано (2026-09-30) · прод (API + Static Site) на `main` `5448b92`, Node 22 · відкрито лише
> рішення про PR #30 / стару гілку.

## Контекст

Обидва Render-сервіси (`olx-dashboard-api`, `olx-dashboard`) деплояться з гілки
`claude/turso-write-optimization-x920p8` (live `ec44940`, 2026-09-26) — бракує 13+ комітів `main`
(фікс обірваних сканів, журнал помилок `app_logs`, автоміграція). На Render `NODE_VERSION=20` (EOL).
Прод-БД Turso `olx-dashboard` (група `default`): бракує лише таблиці `app_logs`; 5 deep-сканів
без `finished_at`. Контекст — `docs/handoffs/2026-09-30-stability-harness-access.md`,
`docs/plans/dev-deploy-harness.md` (H2), `docs/plans/stability-baseline.md`.

Доступи: Render MCP (API-ключ, user scope), Turso MCP (OAuth-плагін, група `default`). Секрети —
лише в `~/.config/olx-dashboard/`, не в репо й не в чаті. Кожна дія, що змінює стан на
Render/Turso, — лише після явного «так».

## Файли

- цей план (після завершення — `docs/plans/old/render-to-main.md`)
- Бекапи — поза репо: `~/.config/olx-dashboard/backups/`
- Після завершення: `docs/deploy-render-turso.md` (гілка `main`, Node 22), `docs/plans/dev-deploy-harness.md` (H2 ✅),
  `docs/plans/stability-baseline.md`, новий handoff.

## Кроки

- [x] **0. План і CI:** цей файл; CI на `main` (`5448b92`) — success.
- [x] **1. Бекап прод-БД** (2026-09-30)
  - [x] 1.1 `delete_protection=true` на `olx-dashboard`
  - [x] 1.2 Гілка-бекап `olx-dashboard-bak-20260930` (branched_at 2026-09-30T07:01:30Z; `delete_protection=true`;
        не чіпати, лише для відновлення). Кількості: listings 4693, projects 3, scan_runs 24, searches 4.
  - [x] 1.3 SQL-дамп `~/.config/olx-dashboard/backups/olx-dashboard-20260930.sql` (20 МБ, read-only токен)
  - [x] 1.4 Звірка: дамп відновлено в тимчасовий SQLite — кількості збігаються з продом
        (listings 4693, price_history 0, projects 3, scan_runs 24, searches 4)
  - Примітка: `create_branch` у Turso MCP повертає таймаут, але гілка створюється асинхронно (~1–2 хв) —
    перед повтором перевіряти `get_database`.
- [x] **2. Прогін `main` на копії** (2026-09-30)
  - [x] 2.1 Гілка-копія `olx-dashboard-test-main` (окремо від бекапу)
  - [x] 2.2 Токен на запис лише для копії → `~/.config/olx-dashboard/turso-test.env` (створила людина;
        перевірено: копія — OK, прод — 401)
  - [x] 2.3 `npm run build -w server` + `node server/dist/index.js` (PORT=3101) проти копії: старт без помилок,
        `/health` 200; `app_logs` + `idx_app_logs_ts` створено (нові таблиці `initDb()` створює мовчки —
        рядків «Міграція схеми» в лозі немає, логуються лише `ADD COLUMN`)
  - [x] 2.4 API: `/api/searches`, `/api/projects` читаються; `/api/searches/:id/listings` разом 4693 = прод
  - [x] 2.5 Копію `olx-dashboard-test-main` видалено, `turso-test.env` видалено (за рішенням людини)
- [x] **3. API-сервіс → `main`**, `NODE_VERSION=22`, деплой (2026-09-30, людина в dashboard)
  - Деплой `dep-dauc7cou01pc73em3n9g`, коміт `5448b92`, live; Node 22.23.3; старт без помилок
  - `/health` 200, `/api/searches` без сесії → 401; у прод-БД з'явилась `app_logs`, listings 4693
- [x] **4. Static Site → `main`**, прибрати битий rewrite `/api/*`, деплой (2026-09-30, людина в dashboard)
  - Деплой `dep-dauc9rfavr4c738kk3g0`, коміт `5448b92`, live; `index.html` і бандл 200, бандл ходить на
    `olx-dashboard-api.onrender.com`; SPA-маршрути → 200; `/api/*` на статиці віддає SPA (не таймаут);
    CORS preflight з фронту → 204 з правильним `access-control-allow-origin`
- [x] **5. Smoke** (2026-09-30): `/health` 200, `app_logs` у проді, логи старту без помилок; людина: логін Google,
  таблиця вантажиться, «Журнал» порожній. Тестовий звичайний скан `iphone` (run 25): `finished_at` є, `error` NULL,
  34/34 запити GraphQL (16 варіантів-синонімів з паузами — за `business-rules.md`), found 819, +699 нових
  (836 → 1535: попередній deep-скан 24 обірвався на синонімі 9/16), warning про пропуск вікна покриття —
  очікуваний для синонімів; warn/error у Render і `app_logs` — 0.
- [x] **6. Прибирання** (2026-09-30)
  - [x] 5 обірваних deep-сканів (18, 19, 20, 23, 24) закрито: `finished_at='2026-09-30T08:30:00.000Z'`,
        `error` = «Скан обірвано … закрито вручну» (за підтвердженням людини; rows_affected 5)
  - [x] Доки: `deploy-render-turso.md` (блок «Фактичний прод», гілка `main`, шпаргалка), `dev-deploy-harness.md` (H2 ✅),
        `stability-baseline.md` (S2, S5, S12 ✅; S9 — частково), handoff `docs/handoffs/2026-09-30-render-on-main.md`
  - [ ] PR #30 / гілка `claude/turso-write-optimization-x920p8` — лишено як є (рішення людини; тепер не впливає на прод)

## Відкат

- Код: у Render повернути гілку `claude/turso-write-optimization-x920p8` (або Rollback на `ec44940`).
  Автоміграція лише додає таблиці/колонки — стара версія з ними працює.
- Дані: гілка `olx-dashboard-bak-20260930` або SQL-дамп з кроку 1.

## Test-cases

1. Дамп: `COUNT(*)` по кожній таблиці в дампі = у проді на момент бекапу.
2. Копія після старту `main`: є `app_logs`, `listings` = 4693, сервер не впав.
3. Прод після деплою: `/health` 200, `https://olx-dashboard.onrender.com` відкривається, логін Google працює,
   таблиця оголошень завантажується.
4. Тестовий скан (≤3 запити до OLX) завершується з `finished_at`.
