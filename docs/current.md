# Поточний стан

Стан «на зараз». Перезаписується скілом `session-close` наприкінці кожної сесії. Історія — у
[handoffs/](handoffs/), стабільні правила — у [rules.md](rules.md), бекло — у [parking.md](parking.md).

## Мета зараз

Пріоритети людини (у такому порядку): **(1) базова стабільність**, **(2) мінімальний харнес для
розробки й деплою**, **(3) «модель JEV»** — здешевити AI-кроки 1–2 без втрати якості через decision-модель Jev
([jev](jev.md)). Історія цін (Етап 3) — не пріоритет ([P-001](parking.md)).

Стабільність закрито ([stability-baseline](plans/old/stability-baseline.md) ✅, 2026-10-04; S15 ⏸ → P-005,
лагодження швидкості S17 → P-010). Харнес закрито ([dev-deploy-harness](plans/old/dev-deploy-harness.md) ✅,
2026-10-04). Зараз — **«модель JEV»**: рушій «Jev» для кроків 1–2 на проді (етап 2, PR #63). Етап 3 (пропуски мінусів
на кроці 2) розв'язано в коді: питання з межею «так/ні» + поріг 0.7 (PR #65, злито й задеплоєно 2026-10-06).
Наступне за рішенням людини — керування критеріями мінусів/плюсів і групування синонімів ([P-015](parking.md)).

## Де ми зараз

- **Прод на `main`** (з 2026-09-30) — конфігурація в [deploy-render-turso](deploy-render-turso.md) →
  «Фактичний прод»; історія переведення — [хендоф](handoffs/2026-09-30-render-on-main.md).
- Останній хендоф — [2026-10-06 jev-criteria-wording](handoffs/2026-10-06-jev-criteria-wording.md): нове питання Jev
  для мінусів/плюсів, проба `jev:probe`, live artifact моніторингу. Рушій за замовчуванням — LLM; Jev — перемикач у
  налаштуваннях AI.
- Деплой обох сервісів — лише після зеленого CI на `main` (Auto-Deploy «After CI Checks Pass»); конфіг Render —
  [`render.yaml`](../render.yaml), еталон без Blueprint ([render-mcp-no-env](instructions/render-mcp-no-env.md)).
- Бекап прод-БД від 2026-09-30: гілка Turso `olx-dashboard-bak-20260930` (захищена від видалення) + SQL-дамп
  у теці ключів агента ([secrets-in-sources](instructions/secrets-in-sources.md)).
- Доступи агента: Render MCP і Turso MCP (OAuth, група `default`); що можна без «так» — [rules](rules.md) →
  «Прод». GitHub — через `gh` ([github-cli](instructions/github-cli.md)); зливати PR після зеленого CI агент
  може, коли людина це дозволила в діалозі.
- Харнес розробки (CI, тести, перевірки) — `AGENTS.md` → «Перевірка»; харнес сесій — `AGENTS.md` → «Сесія».
- Реліз: чекліст, відкат і бекап Turso — [deploy-render-turso](deploy-render-turso.md) → «Реліз, відкат, бекап»;
  після деплою — `npm run smoke`.
- Dependabot — 1-го і 15-го числа PR з minor/patch (npm) і оновленнями дій CI; злиття = деплой, лише з «так»
  людини; major npm — вручну ([P-012](parking.md)).

## Активні плани

- [jev-model](plans/jev-model.md) — етапи 0–3 у проді (етап 3 — PR #65: нове питання, поріг 0.7); лишилась ручна
  перевірка кроку 2 в UI людиною.

## Що враховувати

- Запасного каналу збору немає: HTML-fallback вимкнено (OLX відповідає `403`), ідея обходу — [P-005](parking.md).
- Verify-проба («Перевірити неактивні») теж отримує `403` → нічого не вимикає (S15, відкладено до P-005).
- Великий пошук `iphone` на проді: таблиця й пошук в описі повільні — переважно очікування даних із Turso,
  не CPU (замір S17 — у [stability-baseline](plans/old/stability-baseline.md)); лагодження — [P-010](parking.md), [P-008](parking.md), ідея кешу — [P-011](parking.md).
- Нові задачі з документацією — правило «жодних кількостей» ([rules](rules.md) п. 2); аудит — скіл `docs-audit`.
- Моніторинг скану на проді — [prod-scan-monitoring](instructions/prod-scan-monitoring.md).
- Рядки з прод-БД агенту — лише через Turso MCP або команду людини; читання ключів блокує auto-mode
  ([prod-data-via-turso-mcp](instructions/prod-data-via-turso-mcp.md)).
- Jev MCP/skills jevai.org для агента встановлено глобально, але MCP зараз відповідає `401` — ключ перевипустити
  ([jev-agent-setup](instructions/jev-agent-setup.md)).
- Локально `SQLITE_BUSY` / зайнятий 3001 — старі `tsx watch` ([local-dev-port-busy](instructions/local-dev-port-busy.md)).

## Відкриті питання (чекають людину)

- Ручна перевірка кроку 2 рушієм Jev в UI (більше мінусів/плюсів, ніж до PR #65) — тоді план `jev-model` → ✅ і в `old/`.
- Коли видаляти бекап-гілку Turso `olx-dashboard-bak-20260930`.
- Чи робити скіл з інструкції `prod-scan-monitoring` (запропоновано 2026-10-03) і скіл `prod-release` з runbook релізу (2026-10-04).
- Antigravity — коли робити [P-009](parking.md) (знімок скілів на вимогу).

## Наступний крок

[P-015](parking.md) — план керування критеріями мінусів/плюсів пошуку: місце для перегляду й редагування всіх критеріїв
і UI групування синонімічних формулювань в одну категорію (щоб Jev отримував одне питання на категорію). Паралельно —
ручна перевірка кроку 2 рушієм Jev в UI (PR #65 уже на проді).
