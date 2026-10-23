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
- Останній реліз — 2026-10-22 зрозумілі лічильники у фільтрі «Категорії» ([category-filter-counts](plans/old/category-filter-counts.md)):
  злито й задеплоєно, деталі — у хендофі [2026-10-22 category-filter-counts](handoffs/2026-10-22-category-filter-counts.md).
  Перед тим того ж дня — доробки базових плюсів і мінусів ([base-criteria-polish](plans/old/base-criteria-polish.md),
  частина [P-019](parking.md)); базові набори (правила — [business-rules](business-rules.md) §4) на проді наповнено людиною.
  Модель і рушії AI — [ai-flow](ai-flow.md).
- AI на проді — авто-режим з 2026-10-17: `OPENROUTER_API_KEY` в API (окремий ключ з лімітом), кожна AI-кнопка
  платна ([deploy-render-turso](deploy-render-turso.md) → «Фактичний прод»).
- Деплой обох сервісів — лише після зеленого CI на `main` (Auto-Deploy «After CI Checks Pass»); конфіг Render —
  [`render.yaml`](../render.yaml), еталон без Blueprint ([render-mcp-no-env](instructions/render-mcp-no-env.md)).
- Бекапи прод-БД (гілки Turso, захищені від видалення): `olx-dashboard-bak-20260930` (+ SQL-дамп у теці ключів агента
  на домашньому ПК, [secrets-in-sources](instructions/secrets-in-sources.md)), `olx-dashboard-bak-20261011` і
  `olx-dashboard-bak-20261018` (перед релізом base-criteria).
- Доступи агента: Render MCP і Turso MCP (OAuth, група `default`); що можна без «так» — [rules](rules.md) →
  «Прод». GitHub — через `gh` на обох ПК ([github-cli](instructions/github-cli.md)); зливати PR після зеленого CI агент
  може, коли людина це дозволила в діалозі.
- Харнес розробки (CI, тести, перевірки) — `AGENTS.md` → «Перевірка»; харнес сесій — `AGENTS.md` → «Сесія».
- Реліз: чекліст, відкат і бекап Turso — [deploy-render-turso](deploy-render-turso.md) → «Реліз, відкат, бекап»;
  після деплою — `npm run smoke`.
- Dependabot — 1-го і 15-го числа PR з minor/patch (npm) і оновленнями дій CI; злиття = деплой, лише з «так»
  людини; major npm — вручну ([P-012](parking.md)).

## Активні плани

- [refactor-clean-architecture](plans/refactor-clean-architecture.md) — прагматична чиста архітектура: фази 0–4, 7, 8
  злито в `main` і задеплоєно 2026-10-23 (`npm run smoke` зелений, логи API чисті); фази 5–6 (сканер, скрейпер)
  і 7.4 відкладено рішенням людини. Стан — у [хендофі](handoffs/2026-10-23-refactor-clean-architecture.md).
- [notes-enter-pros-cons-chips](plans/notes-enter-pros-cons-chips.md) (P-003) і [olx-api-audit](plans/olx-api-audit.md)
  (P-017) — код готовий, закомічено в гілці `feat/p003-notes-enter-chips` (не запушено); чекають ручних test-cases
  людини, потім PR. Стан — у [хендофі](handoffs/2026-10-23-p003-chips-olx-audit.md).

Далі з парковки: решта доробок — [P-019](parking.md), точніша автокатегорія пошуку — [P-020](parking.md),
аналіз «за 1 клік» — [P-018](parking.md).

## Що враховувати

- Запасного каналу збору немає: HTML-fallback вимкнено (OLX відповідає `403`), ідея обходу — [P-005](parking.md).
- Чи OLX щось змінив у запитах — скіл `olx-api-audit` / `npm run olx:audit` ([olx-api-audit](instructions/olx-api-audit.md)).
  Сторінку OLX у `iframe` вбудувати не можна ([olx-api](olx-api.md) §3.4).
- Verify-проба («Перевірити неактивні») теж отримує `403`: кнопку вимкнено, прохід зупиняється після серії `403`
  ([verify-403-guard](plans/old/verify-403-guard.md)); обхід — P-005.
- Точність пошуку мінусів LLM низька й від моделі не залежить: заважають розмиті назви критеріїв («сервісна батарея»,
  «не повна комплектація») — заміри в [llm-haiku-prompt-audit](plans/old/llm-haiku-prompt-audit.md); заміряти зміни
  промптів — `npm run llm:eval` ([ai-flow](ai-flow.md) → «Замір точності LLM»). Промпти — універсальні під будь-які
  категорії товарів.
- Браузер агента (wmux): пункти меню «⋮» — лише клавіатурою ([wmux-browser-ark-menu](instructions/wmux-browser-ark-menu.md));
  панель у прихованому workspace — [wmux-browser-hidden-pane](instructions/wmux-browser-hidden-pane.md).
- Автокатегорія пошуку (базові плюси й мінуси) — категорія OLX з найбільшою кількістю оголошень; засмічена видача хибить
  («mac mini» → планшети Apple). Обхід — фільтр пошуку «Категорії» (категорія перераховується одразу); покращення — [P-020](parking.md).
- Ручні test-cases для людини — [manual-test-cases](instructions/manual-test-cases.md); людина проходить їх сама,
  агент лише пише (рішення людини 2026-10-18).
- План агентами з рецензентом без комітів — [sdd-without-commits](instructions/sdd-without-commits.md).
- Діалог поверх іншої модалки з полями вводу — [chakra-nested-dialog-focus](instructions/chakra-nested-dialog-focus.md).
- Великий пошук `iphone` на проді: таблиця й пошук в описі повільні — переважно очікування даних із Turso,
  не CPU (замір S17 — у [stability-baseline](plans/old/stability-baseline.md)); лагодження — [P-010](parking.md), [P-008](parking.md), ідея кешу — [P-011](parking.md).
- Рефакторинг сервера «без зміни поведінки» — звірка GET-відповідей до/після на копії проду
  ([api-equivalence-check](instructions/api-equivalence-check.md)); шари й `layers:check` — `AGENTS.md` → «Конвенції».
- Нові задачі з документацією — правило «жодних кількостей» ([rules](rules.md) п. 2); аудит — скіл `docs-audit`.
- Моніторинг скану на проді — [prod-scan-monitoring](instructions/prod-scan-monitoring.md).
- Рядки з прод-БД агенту — лише через Turso MCP або команду людини; читання ключів блокує auto-mode
  ([prod-data-via-turso-mcp](instructions/prod-data-via-turso-mcp.md)).
- Jev MCP/skills jevai.org для агента: домашній ПК — встановлено, але MCP відповідає `401` (ключ перевипустити);
  робочий ПК — не встановлено ([jev-agent-setup](instructions/jev-agent-setup.md)).
- Локально `SQLITE_BUSY` / зайнятий 3001 — старі `tsx watch` ([local-dev-port-busy](instructions/local-dev-port-busy.md)).
- Локальна БД на робочому ПК — копія проду на 2026-10-22 (`npm run db:copy-prod`, [development](development.md) §4):
  AI-кнопки локально платні так само, як на проді. Токен для копії — Read-Only токен **бази**, не API-токен акаунта
  ([turso-db-token-vs-api-token](instructions/turso-db-token-vs-api-token.md)).
- Turso MCP: SQL-запит → `403 … db:mint-token` — перепідключити ([turso-mcp-scope-403](instructions/turso-mcp-scope-403.md)).

## Відкриті питання (чекають людину)

- Ручні перевірки рушія Jev в UI — у примітках архівних планів [jev-model](plans/old/jev-model.md) (крок 2) і
  [jev-threshold-setting](plans/old/jev-threshold-setting.md) (test-case 3, платно).
- Чи видаляти локальні бекапи `server/data/olx-bak-2026-10-16T12-28-23-237Z.db` (порожній) і
  `olx-bak-2026-10-22T11-14-29-068Z.db` (БД до копії 2026-10-22), робочий ПК.
- Чи потрібен API-токен Turso `claude-code-work` (створено 2026-10-22; для копії БД не підходить).
- Коли видаляти бекап-гілки Turso `olx-dashboard-bak-20260930`, `olx-dashboard-bak-20261011` і `olx-dashboard-bak-20261018`.
- Чи робити скіл з інструкції `prod-scan-monitoring` (запропоновано 2026-10-03) і скіл `prod-release` з runbook релізу (2026-10-04).
- Antigravity — коли робити [P-009](parking.md) (знімок скілів на вимогу).
- Звідки в оголошеннях категорії, яких немає в дереві фільтра (рядок «Інші категорії»; у «mac mini» таких
  помітна частка): чи з'ясовувати, чи достатньо рядка ([category-filter-counts](plans/old/category-filter-counts.md) → «Знахідка»).

## Наступний крок

Людина проходить ручні test-cases планів [notes-enter-pros-cons-chips](plans/notes-enter-pros-cons-chips.md) і
[olx-api-audit](plans/olx-api-audit.md) (локально, гілка `feat/p003-notes-enter-chips`) → push, PR у `main`, злиття
з «так» людини. Далі — фази 5–6 [refactor-clean-architecture](plans/refactor-clean-architecture.md) або парковка
(P-019, P-020, P-018).
