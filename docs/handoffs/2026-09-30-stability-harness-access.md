# Handoff: стабільність, харнес розробки/деплою, доступи Render + Turso

2026-09-30 · сесія 2026-09-28…30: відновлення контексту проєкту → харнес документації → автоміграція
БД → Vitest → CI/Node 22 → аудит проду (Render + Turso).

## Objective

Пріоритети користувача (у такому порядку): **(1) базова стабільність**, **(2) мінімальний харнес для
розробки й деплою**, **(3) нова фіча «підключення моделі JEV»**. Історія цін (Етап 3) — **не
пріоритет**. Зараз — етап аналізу/планів/оцінок і підготовки доступів.

## Current state (ви тут)

- `main` = `5448b92` (PR #33), CI на `main` зелений. Робоча копія чиста.
- У `main` вже є: харнес документації (`AGENTS.md` — точка входу), автоміграція колонок у `initDb()`,
  Vitest (41 тест), CI (`.github/workflows/ci.yml`), Node 22 (`.nvmrc`, `engines`), плани
  `docs/plans/stability-baseline.md` і `docs/plans/dev-deploy-harness.md` з результатами аудиту.
- **Прод НЕ на `main`:** обидва Render-сервіси деплояться з гілки
  `claude/turso-write-optimization-x920p8` (autoDeploy), live-коміт `ec44940` (2026-09-26) — бракує
  13+ комітів `main`, зокрема фіксу обірваних сканів і журналу помилок.
- Render MCP додано (user scope, зі **старим** ключем); Turso MCP — не додано. Користувач тепер за ПК
  і хоче **встановити всі MCP з новими ключами**.
- На ПК у фоні може досі працювати `npm run dev` (server :3001 + web :5173), запущений у цій сесії.

## Decisions (і чому)

- **`AGENTS.md` — єдина точка входу, `CLAUDE.md` видалено:** Claude Code читає `AGENTS.md`
  (підтвердив користувач); Antigravity теж. `AGENTS.md` — коротка карта + інваріанти; механіка — у
  `docs/business-rules.md`, `docs/ai-flow.md`.
- **Скіли: єдине джерело `skills/`**, `.claude/skills` і `.agents/skills` — лише згенеровані обгортки
  (`npm run skills:sync|skills:check`). Причина: користувач працює і з Claude Code (`.claude`), і з
  Antigravity (`.agents`). `simplify` — лише в `.agents` (конфлікт із вбудованим `/simplify` Claude Code).
- **Плани:** рядок `> **Статус:**` під заголовком; виконані → `docs/plans/old/`; непрогнані ручні
  test-cases не відмічати наосліп.
- **Автоміграція схеми:** `initDb()` сам додає відсутні колонки (`ADD COLUMN` з визначенням зі
  `schema.sql`); неможливі зміни → помилка старту з `таблиця.колонка`.
- **Vitest у `server/`**, БД-тести на тимчасовому файлі libSQL (не `olx.db`); тести фіксують поточну
  поведінку, розбіжності — питання людині.
- **CI** на кожен push: `npm ci` → `npm run check` (typecheck + test + docs:check + skills:check) →
  `npm run build`.
- **`NODE_VERSION` на Render не змінено** навмисно: зміна env передеплоїла б стару гілку на Node 22 —
  робити разом із переведенням на `main`.
- **Секрети — поза репо** в `~/.config/olx-dashboard/` (`render.env`, `turso.env`, chmod 600).
- **Доступ до Turso за принципом мінімальних прав:** з Platform-токена видано read-only токен лише
  БД `olx-dashboard` на 7 днів; аудит — тільки читанням.

## Dead ends — не повторювати

- **GitHub MCP-плагін (`plugin:engineering:github`) через OAuth:** «Incompatible auth server: does not
  support dynamic client registration». PR створювались посиланнями `compare/...?expand=1`. Для
  автоматизації PR потрібен `gh` (`winget install GitHub.cli` → `gh auth login`) — **не встановлено**.
- **Claude in Chrome:** розширення не підключене — UI перевіряли лише HTTP-запитами.
- **HTML-fallback OLX:** зараз **HTTP 403** (GraphQL працює) — фактично запасного каналу немає.
- **`/api/*` rewrite на Static Site:** ціль з подвоєним доменом
  `https://olx-dashboard-api.onrender.com.onrender.com/api/*` → таймаут (не впливає — фронт іде через
  `VITE_API_BASE`).
- Технічні пастки сесії: `git checkout -- <file>` відкотив незакомічені правки (не використовувати для
  «прибирання» тестових змін); `cmd | tail` ховає код виходу (коміт пройшов із битим посиланням);
  файли з CRLF ламають точні заміни — нормалізувати `\r\n`; tsx-скрипти з top-level await — `.mts`.

## Artifacts

- `AGENTS.md` — точка входу (final).
- `docs/business-rules.md`, `docs/ai-flow.md`, `docs/development.md`, `docs/olx-monitor-spec.md`
  (продуктова spec), `docs/architecture.md`, `docs/structure.md` — актуальні.
- `docs/plans/stability-baseline.md` — аудит S1–S13 + кроки (active).
- `docs/plans/dev-deploy-harness.md` — H1 CI ✅, H2 Node 22 (репо ✅, Render ⏳), H3–H6 ⏳ (active).
- `docs/plans/vitest-setup.md` — відкрите питання NULL-refresh (active).
- `docs/plans/docs-harness.md` — усе ✅, крім ручної перевірки скілів в Antigravity (active).
- `docs/plans/TODO` — бекло користувача.
- `scripts/check-doc-links.mjs`, `scripts/sync-skills.mjs`, `skills/`, `.github/workflows/ci.yml`.
- Локально поза git: `server/.env` (лише `AUTH_DISABLED=true`, `AUTH_COOKIE_SECURE=false`),
  бекап старої локальної БД `server/data/olx.bak-2026-06-16.db(+-wal)`.

## Verbatim essentials

- Репо: `github.com/RenJeka/olx-dashboard` (публічний; CI читається через API без токена).
- Render (workspace «My Workspace»):
  - Static Site `olx-dashboard` → `https://olx-dashboard.onrender.com` (id `srv-d8ujhi1o3t8c73drge0g`),
    env: `VITE_API_BASE`, `VITE_GOOGLE_CLIENT_ID`.
  - Web Service `olx-dashboard-api` → `https://olx-dashboard-api.onrender.com` (free, id
    `srv-d8ujfrnlk1mc73fuberg`), `healthCheckPath /health`, env: `WEB_ORIGIN`, `AUTH_DISABLED`(порожній),
    `AUTH_COOKIE_SECURE`, `SESSION_SECRET`, `ALLOWED_EMAILS`, `GOOGLE_CLIENT_ID`, `NODE_VERSION=20`,
    `TURSO_AUTH_TOKEN`, `TURSO_DATABASE_URL`.
  - Гілка обох: `claude/turso-write-optimization-x920p8` (= PR #30).
- Turso: org `renjeka` (personal, plan `starter`), група `default`, БД `olx-dashboard`,
  `libsql://olx-dashboard-renjeka.aws-eu-west-1.turso.io`.
- Прод-БД (2026-09-30): 4693 listings, 4 searches, 3 projects, 24 scan_runs; бракує лише таблиці
  `app_logs`; **5 із 13 deep-сканів без `finished_at` і без помилки** (обірвані).
- MCP: Render — `https://mcp.render.com/mcp` (bearer API-ключ);
  Turso — `https://mcp.turso.ai/mcp` (лише OAuth; або плагін `/plugin marketplace add
  tursodatabase/turso-mcp` → `/plugin install turso@turso` → `/mcp` → Authenticate).

## Working preferences (виправлення й побажання користувача)

- Відповіді українською; коміти/PR — англійською; після змін пропонувати текст коміту.
- **У PR не додавати помітку про Claude Code.** (У комітах `Co-Authored-By` лишався — користувач не заперечував.)
- **Гілки не видаляти** без прямого запиту. Зливати PR через **«Create a merge commit»**.
- План — ПЕРШИМ кроком (одного разу порушено для Vitest — зазначено в плані).
- Дії на Render/Turso, що змінюють стан (деплой, env, гілка, запис у БД, видача токенів із правами
  запису) — лише після явного «так»; читання — вільно. Видалення — лише за прямою командою.
- Секрети не виводити в чат/логи; значення env не показувати.
- Користувач часто працює з телефону — давати клікабельні посилання й короткі інструкції.

## Open items

- **Next step:** встановити MCP з **новими** ключами (користувач за ПК):
  1. Відкликати старі ключі, що світилися в чаті: Render API key (`rnd_BbU3…`) і Turso Platform token.
  2. Render: новий API key → `claude mcp remove render -s user` →
     `claude mcp add -s user --transport http render https://mcp.render.com/mcp --header "Authorization: Bearer <KEY>"`;
     оновити `~/.config/olx-dashboard/render.env`.
  3. Turso: плагін/OAuth (обмежити групою `default`); за потреби — новий Platform-токен у
     `~/.config/olx-dashboard/turso.env` (read-only токен БД діє до ~2026-10-07).
  4. Опційно: `gh` (GitHub CLI) для PR.
- **Then** (кожен крок на Render — з підтвердженням):
  1. Бекап прод-БД (дамп у файл поза репо; за можливості — гілка Turso на момент часу).
  2. Render обох сервісів → гілка `main`, `NODE_VERSION=22` (або прибрати — візьме `.nvmrc`),
     виправити/прибрати rewrite `/api/*`, деплой.
  3. Smoke: `/health`, фронт, лог створення `app_logs`, тестовий скан; позначити 5 «вічних» deep-сканів.
  4. Лише після цього — закрити PR #30 / стару гілку (за рішенням користувача).
  5. Далі по `dev-deploy-harness.md`: H3 `render.yaml`, H4 `npm run smoke`, H5 runbook, H6 Dependabot;
     `stability-baseline.md`: S4 (HTML 403), S6 `npm audit fix`, S12, S9.
- **Unresolved questions (чекають користувача):**
  - «Модель JEV» — що це (назва могла спотворитися голосовим вводом), для чого, як доступна
    (API/OpenRouter/локально). План фічі не створено.
  - NULL `last_refresh_at` при `exhausted`: (а) так задумано → уточнити доки; (б) баг → код + тест
    (`docs/plans/vitest-setup.md`).
  - Скопіювати `OPENROUTER_API_KEY` з `C:\GIT\IntervalCardsTelegramBot\.env` у `server/.env`? (не робилось)
- **Blocked:** ручна перевірка скілів в Antigravity (промпт — `docs/development.md` §6) — потребує людини.

## Suggested opening prompt

> Прочитай `AGENTS.md` і `docs/handoffs/2026-09-30-stability-harness-access.md`. Я за ПК. Почнемо з
> «Next step»: допоможи відкликати старі ключі Render/Turso і встановити MCP для Render і Turso з
> новими ключами (Turso — через OAuth-плагін, обмежений групою `default`). Після цього перевір, що
> обидва MCP працюють (лише читання), і запропонуй план переведення Render на `main` з бекапом прод-БД.
