---
name: turso-db-token-vs-api-token
created: 2026-10-22
source: хендоф 2026-10-22-base-criteria-polish-release
---
# Turso: токен бази ≠ API-токен акаунта (`401` у `db:copy-prod`)

## Коли застосовувати
`npm run db:copy-prod` падає з `SERVER_ERROR: Server returned HTTP status 401`, або людина створює токен для
читання прод-БД (копія, скрипт на `@libsql/client`).

## Що робити
- У Turso два різні види токенів:
  - **API Tokens** (налаштування акаунта; у списку — `group: default`, `scopes: read` чи `full access`) — ключ до
    кабінету (Platform API: керувати базами, MCP). До рядків бази через `libsql://` він не пускає → `401`;
  - **токен бази** — https://app.turso.tech → Databases → `olx-dashboard` → «Create Token» (або «Generate Token»)
    → Access **Read-Only**, Expiration — короткий строк. Показується один раз. Саме він іде в `PROD_DB_TOKEN`.
- Після `401` локальна `server/data/olx.db` неповна: повернути попередню командою `Move-Item`, яку друкує скрипт
  (бекап `olx-bak-<час>.db`), і лише потім повторювати копію.
- Процедура копії — [development](../development.md) §4.

## Чого не робити
- Не вставляти токен у чат і не писати в файли — лише змінна середовища в окремому вікні PowerShell, вікно потім
  закрити ([secrets-in-sources](secrets-in-sources.md)).
- Не брати токен з `full access` «щоб точно спрацювало»: копії досить Read-Only токена бази.

## Як перевірити
Скрипт друкує «Готово. Рядків по таблицях: …» і шлях до нової `olx.db`.

## Пов'язане
[turso-mcp-scope-403](turso-mcp-scope-403.md) — `403` від Turso MCP (інша причина: права OAuth).
