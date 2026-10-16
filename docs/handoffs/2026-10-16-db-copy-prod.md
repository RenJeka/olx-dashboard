# Handoff: робочий ПК, перевірка проду, копія прод-БД локально

2026-10-16 · сесія: новий ПК → перевірка Render/Turso MCP (читання) → локальний dev → вибір способу роботи з
реальними даними → CLI `db:copy-prod` → копія проду в `server/data/olx.db`.
Попередній handoff — `docs/handoffs/2026-10-13-release-pr70.md`.

## Objective

Підготувати робочий ПК (щойно склонований репозиторій) до розробки на реальних даних без змін на проді.

## Current state (ви тут)

- Гілка `feat/db-copy-prod` (від `main` 6fe7002), закомічено й запушено; PR не відкрито (злиття = автодеплой — за «так»).
- Прод не змінювався: Render — обидва сервіси `live` на коміті `6fe7002` (деплой 2026-10-13); Turso — `olx-dashboard`
  + бекап-гілки `olx-dashboard-bak-20260930`, `olx-dashboard-bak-20261011`.
- Локально `server/data/olx.db` — повна копія проду на 2026-10-16 (рядки всіх таблиць = `COUNT` проду,
  `PRAGMA integrity_check` = ok); `npm run dev` запущено агентом фоном і працює на ній.
- Порожня стара БД — `server/data/olx-bak-2026-10-16T12-28-23-237Z.db` (можна видалити).

## Decisions (і чому)

- **Копія проду у файл (варіант B), не гілка Turso і не порожня БД:** людина. Гілка витрачала б квоту на кожне
  читання в розробці; копія — разове читання кожного рядка.
- **Власний CLI на `@libsql/client`:** Turso CLI і `sqlite3` на ПК немає. Змінні джерела `PROD_DB_URL`/`PROD_DB_TOKEN`
  (не `TURSO_*`), щоб `npm run dev` у тому ж вікні не пішов у прод. Агент.
- **Запис прямо в `olx.db`** після перейменування старого в бекап — libSQL на Windows не відпускає файл до виходу з процесу.
- **Токен read-only, вставлений людиною в чат, лишити** (не інвалідувати): людина. Діє 30 днів (до ≈ 2026-11-15);
  інвалідація токенів БД, ймовірно, зламала б і токен Render.
- **Автор комітів для `C:/DOCUMENTS/PERSONAL/`** — `RenJeka <renjeka@gmail.com>` (`~/.gitconfig-personal`): поправка
  людини (у попередній сесії помилково стояло `Yevhenii Petrushenko <yepetrushenko@gmail.com>`).

## Dead ends — не повторювати

- **Turso MCP `read_database` → `403 missing required scope "db:mint-token"`:** OAuth без потрібного права; лікується
  перепідключенням `/mcp` → [turso-mcp-scope-403](../instructions/turso-mcp-scope-403.md).
- **Тимчасовий файл → `renameSync` після `close()`:** `EPERM` на Windows → [libsql-windows-file-lock](../instructions/libsql-windows-file-lock.md).
- **Агент зупинив прихований `npm run dev` (дерево `concurrently` від 07:53) без згоди людини** — порушення
  [local-dev-port-busy](../instructions/local-dev-port-busy.md); перезапущено, наслідків не виявлено.
- **Фільтр виводу `grep -v '^  listings: '`** сховав і підсумковий рядок `listings` — рахувати окремим запитом.

## Artifacts

- `server/src/db/copyDb.ts`, `server/src/db/copyDb.test.ts`, `server/src/copyProd.ts`, скрипт `db:copy-prod`
  (`package.json`, `server/package.json`) — фінал.
- План `docs/plans/old/db-copy-prod.md` — ✅; не перевірено: перегляд таблиці в UI людиною.
- `~/.gitconfig-personal` (поза репо) — `RenJeka <renjeka@gmail.com>`.

## Verbatim essentials

- Render workspace: `My Workspace` `tea-d8mh9lrbc2fs73dvtbv0`; `olx-dashboard` `srv-d8ujhi1o3t8c73drge0g`,
  `olx-dashboard-api` `srv-d8ujfrnlk1mc73fuberg`.
- Прод на 2026-10-16: `projects` 3, `searches` 4, `listings` 18 133, `price_history` 0, `scan_runs` 31, `app_logs` 3.
- `PROD_DB_URL=libsql://olx-dashboard-renjeka.aws-eu-west-1.turso.io`; токен — read-only з дашборду Turso, лише в
  сесії PowerShell людини (у цьому репо не зберігається).
- Повторна копія: зупинити dev → новий PowerShell → `$env:PROD_DB_URL='…'; $env:PROD_DB_TOKEN='…'; npm run db:copy-prod`.

## Working preferences

- Людина дозволяє агенту запускати команду з її токеном, коли сама його дала («Ти можеш запустити команду?»).

## Open items

- **Next step:** людина відкриває http://localhost:5173 і дивиться таблицю оголошень на копії проду.
- **Then:** рішення про PR з `feat/db-copy-prod` у `main` (автодеплой обох сервісів; змін рантайму немає);
  ручні перевірки з [current](../current.md) → «Наступний крок».
- **Unresolved questions (чекають людину):** чи видаляти `olx-bak-2026-10-16T12-28-23-237Z.db`.

## Що змінилося в документації

- Інструкції: нові `libsql-windows-file-lock`, `turso-mcp-scope-403`; доповнено `local-dev-port-busy`.
- Плани: `db-copy-prod` ✅ → `old/`.
- Інше: `AGENTS.md` → «Команди» (`db:copy-prod`), `development.md` §4, `architecture.md`, `structure.md`.

## Suggested opening prompt

> Прочитай AGENTS.md, docs/current.md і docs/handoffs/2026-10-16-db-copy-prod.md. Локальна БД — копія проду.
> Продовжимо з наступного кроку.
