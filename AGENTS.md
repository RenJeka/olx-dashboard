# AGENTS.md — olx-monitor

> Єдина точка входу для AI-агентів (Claude Code, Codex, Antigravity тощо); окремого CLAUDE.md
> немає. Тут — стек, інваріанти, які не можна порушувати, команди, конвенції й **карта
> документації**. Детальна механіка — у документах із розділу «Карта документації».

Персональна система моніторингу оголошень OLX.ua: збір → SQLite/libSQL → React-таблиця зі
статусами/нотатками/історією цін, AI-аналіз описів, експорт у Notion (етап 4). Single-user:
локальний запуск або деплой Render + Turso за Google-OAuth «воротами».

## Стек (не відхилятися без явного запиту)

- **Monorepo:** npm workspaces — `server/` + `web/`. Node.js **22 LTS** (`.nvmrc`, `engines`), TypeScript strict.
- **Backend:** **Fastify**, **`@libsql/client`** (асинхронний; локально — файл
  `server/data/olx.db`, у проді — Turso; хелпери `dbAll`/`dbRun` у `server/src/db/db.ts`),
  **cheerio** (HTML-парсинг), **node-cron** (етап 4, ще не підключений). better-sqlite3 — більше НЕ використовується.
- **Frontend:** React 18 + **Vite** + **TanStack Table v8** + **TanStack Query v5** + **Chakra UI v3**
  (сніпети провайдера/тостера/тултіпа — `web/src/components/ui/`; токени — `docs/styles.md`),
  іконки **`react-icons/lu`**, клієнтський UI-стан між компонентами — **Zustand** (in-memory, `web/src/stores/`).
- **Auth:** Google OAuth single-user gate — `@fastify/jwt` + `@fastify/cookie` + `jose`
  (`server/src/auth/`), `@react-oauth/google` (`web/src/auth/`). Allowlist email, без таблиці users.
- **AI:** OpenRouter через звичайний `fetch` (без SDK); Excel-експорт — `exceljs` (не `xlsx`/SheetJS:
  CVE + платна модель); ZIP ручного режиму — `archiver`. `.env` — `process.loadEnvFile`, без dotenv.
- **Логування:** pino (той самий, що у Fastify) + `pino-pretty` (dev); єдиний сервіс
  `server/src/logger.ts` → stdout + таблиця `app_logs` (лише warn/error), діалог «Журнал» в UI.
- **Notion:** `@notionhq/client` (етап 4).
- **Тести:** **Vitest** (`server/`, dev), БД-тести — на тимчасовому файлі libSQL (не `server/data/olx.db`).
- **НЕ використовувати:** Express, Prisma/ORM, PostgreSQL, Redux, Playwright/браузер для збору.
- **Turso-економія:** кожен рядок читання/запису коштує квоти — батчити запити, не додавати
  індекси на часто оновлювані колонки, заміряти скілом `turso-reads-playbook`.

## Інваріанти (не порушувати; повна механіка — `docs/business-rules.md`)

**Збір з OLX** (деталі — `docs/olx-api.md`):
- Основний метод — **GraphQL** `POST https://www.olx.ua/apigateway/graphql` (без кукі/auth/токенів),
  `sort_by=created_at:desc`. **Fallback — HTML + cheerio**, вмикається автоматично; усі селектори —
  лише в `server/src/scraper/selectors.ts`. Усі стратегії — за інтерфейсом `OlxFetcher`.
- **Ввічливість:** звичайний скан ≤3 запити з паузою 1–2 с; глибокий — батчі по 3 з паузою 3–6 с
  і жорсткими запобіжниками (вікно пагінації OLX `offset ≤ 1000`).
- Наступні fallback (`__NEXT_DATA__` → headed Playwright) — **лише за рішенням людини**.

**Дані й статуси:**
- Канонічна схема — `server/src/db/schema.sql` (не дублювати в коді). `listings.olx_id` UNIQUE —
  ключ дедуплікації; upsert по ньому. `price_history` (зміна ціни) — ⏳ Етап 3, кодом ще не пишеться.
- `status` ∈ `new|interested|contacted|rejected|disabled`, `status_source` ∈ `auto|manual`.
- **Ручне завжди сильніше за авто:** `status_source='manual'` не перетирається auto-логікою
  (виняток — `rejected → disabled`); manual-disabled не реактивується автоматично; ручні
  `ai_relevant` / ранги не перетирає AI-прогін.
- **Auto-disable** — лише з доказом: вікно покриття на осі **`last_refresh_at`** (не `posted_at`,
  інцидент 395 хибних disable) і лише після **повного** GraphQL-скану (split-, синонімні, зупинені,
  HTML-скани його пропускають); `olx_status ≠ active`; verify-проба `410/404`. Кожен auto-disable
  пише причину в `note`.
- `local_filters` лише ставлять `filtered_out`, **ніколи не видаляють** рядки.
- Помилки скрейпінгу не валять процес: лог у `scan_runs.error` / журнал, попередні дані лишаються;
  зібране під час упалого чи зупиненого скану зберігається.

**AI** (деталі — `docs/ai-flow.md`):
- **Ніколи не авто** — лише за кнопкою (жодних викликів зі сканів/автооновлення/cron).
- **PII продавця в промпт не йде**; промпти — єдине джерело в `server/src/analysis/`.
- `evidence` верифікується як підрядок опису і **в БД не зберігається**.
- Критерії — на рівні пошуку, мінуси/плюси та вердикти — на рівні оголошення.

**Безпека:** секрети (`TURSO_AUTH_TOKEN`, `SESSION_SECRET`, `OPENROUTER_API_KEY`, `GOOGLE_CLIENT_ID`,
`NOTION_TOKEN`…) — лише в `.env`, ніколи в код/git. `server/data/*.db` — gitignored.
`AUTH_DISABLED=true` — лише локально.

## Команди

```bash
npm run dev                     # server (Fastify, :3001) + web (Vite, :5173) паралельно
npm run dev:server | dev:web
npm run build                   # tsc server + tsc/vite web (перевірка типів)
npm run scan -- --search <id>   # CLI-скан без UI (--deep, --verify)
npm run docs:check              # биті посилання в документації (має бути 0)
npm run typecheck               # tsc --noEmit для server і web
npm test                        # Vitest (server): доменне ядро на тимчасовій БД
npm run check                   # typecheck + test + docs:check + skills:check — перед комітом
npm run skills:sync             # перегенерувати обгортки скілів після зміни skills/
```

**Перший запуск:** `npm install` → `cp server/.env.example server/.env` (мінімум
`AUTH_DISABLED=true`, `AUTH_COOKIE_SECURE=false`; порожній `TURSO_DATABASE_URL` → локальний файл) →
`npm run dev` → http://localhost:5173. Деплой — `docs/deploy-render-turso.md`.

**Міграції схеми:** `schema.sql` — єдине джерело. На старті `initDb()` сам додає в наявні таблиці
(локально й у Turso) колонки, яких бракує (`ADD COLUMN` з визначенням зі схеми), і створює нові
таблиці/індекси. Вручну (rebuild таблиці) — лише те, що `ADD COLUMN` не вміє: `PRIMARY KEY`,
`UNIQUE`, `NOT NULL` без дефолту, `DEFAULT (вираз)`, зміна/видалення колонок чи `CHECK` — старт
тоді падає з назвою `таблиця.колонка`. Деталі — `docs/plans/old/db-auto-migrate.md`.

**Перевірка:** CI (GitHub Actions, `.github/workflows/ci.yml`) на кожен push: `npm ci` →
`npm run check` → `npm run build`; червоний CI = не зливати. Локально мінімум — `npm run check` (включно з Vitest-тестами `server/src/**/*.test.ts`), далі
smoke API / UI за `docs/development.md` (драбина перевірок, Definition of Done). Зміна доменної
логіки (статуси, upsert, фільтри, AI-парсинг) — разом із тестом. UI/E2E — сабагент
`playwright-tester`, лише за явним запитом.

## Конвенції

- Без `any` у доменних типах (scraper/db/logic). Доменні типи — `server/src/types/` (реекспорт — `types.ts`),
  фронтенду — `web/src/types/`; DTO між беком і фронтом дублюються (без build-зчеплень).
- Коментарі та UI-текст — українською; код/ідентифікатори — англійською.
- Після змін пропонувати текст git commit англійською (тільки текст).
- **Плани:** перед правками коду нової фічі/задачі — ПЕРШИМ кроком файл `docs/plans/<назва>.md`
  (контекст → файли → кроки з чекбоксами → test-cases). Під заголовком — рядок
  `> **Статус:** 🟢 активний | ✅ виконано (YYYY-MM-DD) | ⏸ відкладено` (+ примітки через ` · `).
  Невиконані ручні test-cases не відмічати «наосліп» — назвати в примітці. Після завершення —
  статус ✅ і `git mv` у `docs/plans/old/` (історичний знімок: шляхи до коду там не оновлюються).
- **Документація:** нові файли/пакети/скрипти/ендпойнти → оновити `docs/architecture.md` і
  `docs/structure.md`; зміна бізнес-правила → `docs/business-rules.md` (+ коротко тут, якщо це
  інваріант); зміна запитів/розмітки OLX → `docs/olx-api.md` (+ журнал §6). Після
  переміщень/перейменувань — `npm run docs:check`.

## Карта документації

| Питання | Документ |
|---|---|
| Як влаштовано систему, модулі, API-ендпойнти, потік даних? | [`docs/architecture.md`](docs/architecture.md) |
| Де лежить файл X / куди дивитись у коді? | [`docs/structure.md`](docs/structure.md) |
| Як працюють скани, вікно покриття, verify, override, синоніми? | [`docs/business-rules.md`](docs/business-rules.md) |
| Як ми ходимо в OLX (GraphQL, HTML, пагінація, селектори), що робити, якщо OLX щось змінив? | [`docs/olx-api.md`](docs/olx-api.md) (§5 — чекліст) |
| Які поля повертає GraphQL OLX? | [`docs/olx-graphql-fields-reference.md`](docs/olx-graphql-fields-reference.md) |
| Як працюють AI-кроки (фільтр, мінуси/плюси, AI Вибір), рушії, обсяг, ZIP? | [`docs/ai-flow.md`](docs/ai-flow.md) |
| Як вести задачу, чим перевіряти, коли «готово», як безпечно з OLX і БД? | [`docs/development.md`](docs/development.md) |
| Кольори/токени UI (світла/темна тема)? | [`docs/styles.md`](docs/styles.md) |
| Вимоги продукту (що ✅ / ⏳), етапи, поза скоупом, ризики? | [`docs/olx-monitor-spec.md`](docs/olx-monitor-spec.md) |
| Деплой / Google OAuth? | [`docs/deploy-render-turso.md`](docs/deploy-render-turso.md), [`docs/google-oauth-setup.md`](docs/google-oauth-setup.md) |
| Що зараз у роботі / бекло? | [`docs/plans/`](docs/plans/) (активні плани), [`docs/plans/TODO`](docs/plans/TODO) |
| Де зупинилась попередня сесія (стан, рішення, наступний крок)? | [`docs/handoffs/`](docs/handoffs/) — найсвіжіший файл |
| Чому щось зроблено саме так (історія рішень)? | [`docs/plans/old/`](docs/plans/old/README.md) |
| Скіли й сабагенти проєкту | [`skills/`](skills/README.md) — єдине джерело; `.claude/skills/` і `.agents/skills/` — згенеровані обгортки (не редагувати); сабагент `.claude/agents/playwright-tester.md` |

## Етапи (рухатись по черзі, не забігати вперед)

1. ✅ **MVP:** збір (GraphQL + HTML-fallback), схема, upsert, скан-роут + CLI, React-таблиця на Chakra UI v3.
2. ✅ **Статуси + нотатки + інлайн-едіт + локальні фільтри + verify-прохід.**
3. price_history + спарклайни + MD-експорт для аналізу в Claude.
4. Notion-експорт + node-cron + журнал scan_runs.

> Поза етапами (за окремими запитами) ✅: глибокий скан (розбиття по ціні, двофазний, зупинка),
> синоніми, проєкти, категорії, AI (фільтр релевантності, мінуси/плюси, AI Вибір), Turso + Render,
> Google OAuth, журнал помилок, відновлення часткових сканів. Історія — `docs/plans/old/`.

## Що питати перед дією

- GraphQL почав падати → діагностика за чеклістом `docs/olx-api.md` §5 (HTML-fallback вмикається
  автоматично); НЕ переходити одразу на Playwright; спершу перевірити `__NEXT_DATA__` і показати
  людині зразок HTML.
- Зміни стеку, схеми БД чи інваріантів вище — лише після підтвердження.
