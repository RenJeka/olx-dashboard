# Handoff: H3 — `render.yaml` як еталон, деплой лише після зеленого CI

2026-10-04 · сесія: старт → пояснення H3 і варіанти → варіант А → звірка з Render «Generate Blueprint» →
Auto-Deploy «After CI Checks Pass» → PR #61 → деплой і smoke → закриття.
Попередній handoff — `docs/handoffs/2026-10-04-s17-s10-harness.md`.

## Objective

Закрити H3 — останній крок харнесу деплою: конфіг Render у git без ризику для проду, деплой лише після зеленого CI.

## Current state (ви тут)

- `main` = `aa53063` (PR #61) + PR закриття цієї сесії. Обидва сервіси Render `live` на `aa53063`, `npm run smoke` — усе ✅.
- Обидва сервіси Render: `autoDeployTrigger: checksPass` (перевірено Render API).
- Харнес розробки й деплою (H1–H6) закрито; план `dev-deploy-harness` — ✅ в `old/`. Наступна велика тема — «модель JEV».

## Decisions (і чому)

- **Варіант А — `render.yaml` лише еталон, Blueprint не підключено** (людина): новий Blueprint поверх наявних
  сервісів створює дублікати з суфіксом (документація Render); користь Blueprint для двох free-сервісів мала.
- **Auto-Deploy «After CI Checks Pass»** (людина, перемкнула в dashboard): раніше було `commit` — прямий push у
  `main` ішов на прод без CI. Окремо від `render.yaml`: у варіанті А файл нічого не вмикає.
- **`AUTH_DISABLED` на проді лишається** (людина): вимикає вхід лише рівно `true`; зараз вхід працює (smoke `401`).
- **Чернетку `render.yaml` звіряти з «Generate Blueprint»**, а не з кодом/доками: Render MCP env і routes не віддає.

## Dead ends — не повторювати

- **Моє твердження «Render приєднає наявні сервіси з тією ж назвою до нового Blueprint»** — хибне, документація
  Render: створить нові з суфіксом. → `docs/instructions/render-mcp-no-env.md`.
- **Зібрати env проду з коду й доків** — розійшлося з реальністю (див. Verbatim). → та сама інструкція.

## Artifacts

- `render.yaml` (корінь) — фінал, еталон; секрети `sync: false`.
- PR #61 (`feat/h3-render-yaml`, 2 коміти + merge `aa53063`) — злитий, на проді. Гілку не видаляли.
- CodeRabbit на PR #61: одне зауваження (застарілий опис `commit` у плані) — виправлено комітом `819e76f`.
- Render, обидва сервіси: Auto-Deploy → «After CI Checks Pass» (змінила людина).

## Verbatim essentials

- Render workspace `tea-d8mh9lrbc2fs73dvtbv0` («My Workspace», єдиний). Сервіси: API `srv-d8ujfrnlk1mc73fuberg`,
  фронт `srv-d8ujhi1o3t8c73drge0g`; у Render — проєкт «📊 OLX dashboard project», середовище Production.
- Env API на проді (ключі): `NODE_VERSION`, `ALLOWED_EMAILS`, `WEB_ORIGIN`, `AUTH_DISABLED`, `AUTH_COOKIE_SECURE`,
  `SESSION_SECRET`, `GOOGLE_CLIENT_ID`, `TURSO_AUTH_TOKEN`, `TURSO_DATABASE_URL`. Фронт: `VITE_GOOGLE_CLIENT_ID`,
  `VITE_API_BASE`. `OPENROUTER_API_KEY` на проді немає.
- Перевірка тригера: CI `main` (run `37220869409`) завершився 17:32:50 UTC → деплої `dep-db18rh0ae00c73f9kdhg` (API)
  і `dep-db18rh0ae00c73f9kdog` (фронт) створені 17:32:52 UTC → `live`.

## Working preferences

- Людина просить пояснювати, як пов'язані між собою частини пропозиції (питання «до чого тут перемикач і
  `render.yaml`»): не змішувати в одному пункті незалежні дії без пояснення зв'язку.

## Open items

- **Next step:** «модель JEV» — спершу з'ясувати з людиною, що це, для чого, як доступна (API / OpenRouter / локально).
- **Then:** бекло — P-010, P-008, P-011, P-012, P-005.
- **Unresolved questions (чекають людину):** «модель JEV»; `OPENROUTER_API_KEY` локально; коли видаляти бекап-гілку
  Turso `olx-dashboard-bak-20260930`; скіли з `prod-scan-monitoring` і `prod-release`; P-009.

## Що змінилося в документації

- Інструкції: нова `render-mcp-no-env`.
- Парковка: без змін.
- Плани: ✅ і в `old/` — `h3-render-yaml`, `dev-deploy-harness`.
- Доменна документація: `deploy-render-turso.md` («Фактичний прод», runbook — «Зміна налаштувань у Render»),
  `structure.md` (`render.yaml`).
- Скіли: нових немає.

## Suggested opening prompt

> /session-start. Харнес закрито. Беремо «модель JEV»: розпитай мене, що це й навіщо, перш ніж щось планувати.
