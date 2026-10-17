# Поточний стан

Стан «на зараз». Перезаписується скілом `session-close` наприкінці кожної сесії. Історія — у
[handoffs/](handoffs/), стабільні правила — у [rules.md](rules.md), бекло — у [parking.md](parking.md).

## Мета зараз

Пріоритети людини (у такому порядку): **(1) базова стабільність**, **(2) мінімальний харнес для
розробки й деплою**, **(3) «модель JEV»** — здешевити AI-кроки 1–2 без втрати якості через decision-модель Jev
([jev](jev.md)). Історія цін (Етап 3) — не пріоритет ([P-001](parking.md)).

Стабільність і харнес закрито ([stability-baseline](plans/old/stability-baseline.md),
[dev-deploy-harness](plans/old/dev-deploy-harness.md)); рушій Jev, керування критеріями й Claude Haiku — на проді
(історія — [plans/old/](plans/old/README.md)). Що з AI зараз працює — [ai-flow](ai-flow.md).

## Де ми зараз

- **Прод на `main`** (з 2026-09-30) — конфігурація в [deploy-render-turso](deploy-render-turso.md) →
  «Фактичний прод»; історія переведення — [хендоф](handoffs/2026-09-30-render-on-main.md).
- Останній хендоф і реліз — [2026-10-16 docs-audit](handoffs/2026-10-16-docs-audit.md): аудит документації й
  `npm run db:copy-prod` (копія прод-БД у локальний файл) — на проді, smoke ✅. Модель і рушії AI — [ai-flow](ai-flow.md).
- AI на проді — авто-режим з 2026-10-17: `OPENROUTER_API_KEY` в API (окремий ключ з лімітом), кожна AI-кнопка
  платна ([deploy-render-turso](deploy-render-turso.md) → «Фактичний прод»).
- Деплой обох сервісів — лише після зеленого CI на `main` (Auto-Deploy «After CI Checks Pass»); конфіг Render —
  [`render.yaml`](../render.yaml), еталон без Blueprint ([render-mcp-no-env](instructions/render-mcp-no-env.md)).
- Бекапи прод-БД (гілки Turso, захищені від видалення): `olx-dashboard-bak-20260930` (+ SQL-дамп у теці ключів агента
  на домашньому ПК, [secrets-in-sources](instructions/secrets-in-sources.md)) і `olx-dashboard-bak-20261011`.
- Доступи агента: Render MCP і Turso MCP (OAuth, група `default`); що можна без «так» — [rules](rules.md) →
  «Прод». GitHub — через `gh` на обох ПК ([github-cli](instructions/github-cli.md)); зливати PR після зеленого CI агент
  може, коли людина це дозволила в діалозі.
- Харнес розробки (CI, тести, перевірки) — `AGENTS.md` → «Перевірка»; харнес сесій — `AGENTS.md` → «Сесія».
- Реліз: чекліст, відкат і бекап Turso — [deploy-render-turso](deploy-render-turso.md) → «Реліз, відкат, бекап»;
  після деплою — `npm run smoke`.
- Dependabot — 1-го і 15-го числа PR з minor/patch (npm) і оновленнями дій CI; злиття = деплой, лише з «так»
  людини; major npm — вручну ([P-012](parking.md)).

## Активні плани

Немає.

## Що враховувати

- Запасного каналу збору немає: HTML-fallback вимкнено (OLX відповідає `403`), ідея обходу — [P-005](parking.md).
- Verify-проба («Перевірити неактивні») теж отримує `403`: кнопку вимкнено, прохід зупиняється після серії `403`
  ([verify-403-guard](plans/old/verify-403-guard.md)); обхід — P-005.
- Точність пошуку мінусів LLM низька й від моделі не залежить: заважають розмиті назви критеріїв («сервісна батарея»,
  «не повна комплектація») — заміри в [llm-haiku-prompt-audit](plans/old/llm-haiku-prompt-audit.md); заміряти зміни
  промптів — `npm run llm:eval` ([ai-flow](ai-flow.md) → «Замір точності LLM»). Промпти — універсальні під будь-які
  категорії товарів.
- Браузер агента (wmux): пункти меню «⋮» — лише клавіатурою ([wmux-browser-ark-menu](instructions/wmux-browser-ark-menu.md));
  панель у прихованому workspace — [wmux-browser-hidden-pane](instructions/wmux-browser-hidden-pane.md).
- Ручні test-cases для людини — [manual-test-cases](instructions/manual-test-cases.md).
- Діалог поверх іншої модалки з полями вводу — [chakra-nested-dialog-focus](instructions/chakra-nested-dialog-focus.md).
- Великий пошук `iphone` на проді: таблиця й пошук в описі повільні — переважно очікування даних із Turso,
  не CPU (замір S17 — у [stability-baseline](plans/old/stability-baseline.md)); лагодження — [P-010](parking.md), [P-008](parking.md), ідея кешу — [P-011](parking.md).
- Нові задачі з документацією — правило «жодних кількостей» ([rules](rules.md) п. 2); аудит — скіл `docs-audit`.
- Моніторинг скану на проді — [prod-scan-monitoring](instructions/prod-scan-monitoring.md).
- Рядки з прод-БД агенту — лише через Turso MCP або команду людини; читання ключів блокує auto-mode
  ([prod-data-via-turso-mcp](instructions/prod-data-via-turso-mcp.md)).
- Jev MCP/skills jevai.org для агента: домашній ПК — встановлено, але MCP відповідає `401` (ключ перевипустити);
  робочий ПК — не встановлено ([jev-agent-setup](instructions/jev-agent-setup.md)).
- Локально `SQLITE_BUSY` / зайнятий 3001 — старі `tsx watch` ([local-dev-port-busy](instructions/local-dev-port-busy.md)).
- Локальна БД на робочому ПК — копія проду на 2026-10-16 (`npm run db:copy-prod`, [development](development.md) §4):
  AI-кнопки локально платні так само, як на проді. Read-only токен Turso, вставлений у чат 2026-10-16, людина
  вирішила лишити (діє до ≈ 2026-11-15).
- Turso MCP: SQL-запит → `403 … db:mint-token` — перепідключити ([turso-mcp-scope-403](instructions/turso-mcp-scope-403.md)).

## Відкриті питання (чекають людину)

- Що робити з точністю пошуку мінусів: точніші назви критеріїв, рушій Jev чи база типових критеріїв ([P-016](parking.md)).
- Ручні перевірки рушія Jev в UI — у примітках архівних планів [jev-model](plans/old/jev-model.md) (крок 2) і
  [jev-threshold-setting](plans/old/jev-threshold-setting.md) (test-case 3, платно).
- Чи видаляти порожній старий файл `server/data/olx-bak-2026-10-16T12-28-23-237Z.db` (робочий ПК).
- Коли видаляти бекап-гілки Turso `olx-dashboard-bak-20260930` і `olx-dashboard-bak-20261011`.
- Чи робити скіл з інструкції `prod-scan-monitoring` (запропоновано 2026-10-03) і скіл `prod-release` з runbook релізу (2026-10-04).
- Antigravity — коли робити [P-009](parking.md) (знімок скілів на вимогу).

## Наступний крок

Ручна перевірка людиною на проді — «Згрупувати автоматично» у вікні «Плюси та мінуси» (test-case 3
[llm-haiku-prompt-audit](plans/old/llm-haiku-prompt-audit.md) пройдено 2026-10-17).
