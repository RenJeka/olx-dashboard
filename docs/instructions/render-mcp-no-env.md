---
name: render-mcp-no-env
created: 2026-10-04
source: docs/handoffs/2026-10-04-h3-render-yaml.md
---
# Render MCP не показує змінних середовища й rewrite

## Коли застосовувати
Треба дізнатися, які змінні середовища (env) чи правила rewrite задані в сервісах Render, або звірити
[`render.yaml`](../../render.yaml) з продом.

## Що робити
- Render MCP (`list_services`, `get_service`) показує build/start-команди, гілку, тариф, регіон,
  `autoDeployTrigger`, health-check, але **не** env і **не** routes Static Site. Кожен виклик вимагає
  `workspaceId` — id з `list_workspaces`.
- Повний конфіг дає людина: Render dashboard → виділити обидва сервіси → **Generate Blueprint** → файл YAML.
  Там є всі ключі env (значень немає — `sync: false`) і routes. Порядок звірки — [deploy-render-turso](../deploy-render-turso.md)
  → «Зміна налаштувань у Render».
- Значення env не перевіряти читанням — лише поведінкою (напр. `npm run smoke`: API без сесії → `401`).

## Чого не робити
- Не вгадувати набір env з коду чи доків як «стан проду»: на проді бувають ключі, яких у доках немає, і
  навпаки (2026-10-04: `AUTH_DISABLED`, `AUTH_COOKIE_SECURE` є, `OPENROUTER_API_KEY` немає).
- Не створювати новий Blueprint з `render.yaml` поверх наявних сервісів: Render створить **нові** сервіси
  з суфіксом у назві (дублікати), а не підхопить наявні.

## Як перевірити
`render.yaml` збігається зі згенерованим Render YAML за ключами env, routes і полями сервісів.

## Пов'язане
- [render-env-change-redeploys](render-env-change-redeploys.md) — зміна env = редеплой.
- Рішення не підключати Blueprint — [h3-render-yaml](../plans/old/h3-render-yaml.md).
