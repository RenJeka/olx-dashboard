---
name: turso-mcp-scope-403
created: 2026-10-16
source: хендоф 2026-10-16-db-copy-prod
---
# Turso MCP: `403 missing required scope "db:mint-token"` на SQL-запитах

## Коли застосовувати
`list_databases` / `list_branches` працюють, а `read_database` (чи інший SQL-виклик) повертає
`API request failed: HTTP 403: api token is missing required scope "db:mint-token"`.

## Що робити
- OAuth-токен плагіна (`plugin:turso:turso`) видано без права видавати токени до БД. Людина: `/mcp` → turso →
  вийти й авторизуватися знову, погодивши всі дозволи. 2026-10-16 після такого перепідключення запити запрацювали.
- Далі — звичайні правила читання проду: [prod-data-via-turso-mcp](prod-data-via-turso-mcp.md), квота —
  `AGENTS.md` → «Turso-економія».

## Чого не робити
- Не обходити через ключі з теки агента чи `.env` ([secrets-in-sources](secrets-in-sources.md)).
- Не повторювати запит у циклі — без перепідключення відповідь не зміниться.

## Як перевірити
`read_database` з `SELECT 1` повертає рядок.

## Пов'язане
[prod-data-via-turso-mcp](prod-data-via-turso-mcp.md), [turso-create-branch-timeout](turso-create-branch-timeout.md).
