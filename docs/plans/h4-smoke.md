# План: H4 — smoke-перевірка деплою

> **Статус:** 🟢 активний (з 2026-10-04)

## Контекст

H4 з [dev-deploy-harness](dev-deploy-harness.md): одна команда за хвилину перевіряє, що задеплоєний прод живий.
Лише GET-запити без сесії: ні в OLX, ні в Turso нічого не пишеться, дані не читаються (гейт `401`).

## Файли

- `scripts/smoke.mjs` — перевірки; без аргументів — адреси проду з
  [deploy-render-turso](../deploy-render-turso.md) → «Фактичний прод».
- `package.json` — скрипт `smoke`.
- Документація: `AGENTS.md` → «Команди», `docs/deploy-render-turso.md`, `docs/structure.md`.

## Перевірки

| # | Що | Очікувано |
|---|---|---|
| 1 | API `GET /health` (з урахуванням холодного старту Render free) | `200`, `{"ok":true}` |
| 2 | API `GET /api/searches` без кукі | `401` — гейт авторизації закритий |
| 3 | CORS: `GET /health` з `Origin` фронту | `access-control-allow-origin` = адреса фронту |
| 4 | Фронт `GET /` | `200`, є `<div id="root">` |
| 5 | Перший JS-бандл з `index.html` | `200` |

Будь-який ❌ → код виходу `1`.

## Кроки

- [x] `scripts/smoke.mjs` + `npm run smoke`.
- [x] Прогін проти проду — усе ✅; проти хибної адреси фронту — ❌ і код `1`.
- [x] Документація (`architecture.md` не описує службові скрипти — не чіпали).
- [ ] PR → CI → «так» людини.

## Test-cases

- [x] `npm run smoke` (прод) → усі ✅, код `0`.
- [x] `npm run smoke -- https://olx-dashboard-api.onrender.com https://example.com` → ❌ на фронті/CORS, код `1`.
