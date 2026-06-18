# Initial MVP — OLX Dashboard (Етап 1)

> Прогрес: познач `[x]` коли пункт виконано. Легенда: `[ ]` — заплановано, `[~]` — у роботі, `[x]` — готово.

## Context

Репозиторій порожній (початковий коміт + `CLAUDE.md` + `docs/`). Завдання — за промптом
`docs/claude-code-scaffold-prompt.md` збудувати **тільки Етап 1 (MVP)** згідно канону
(`CLAUDE.md` + `docs/olx-monitor-spec.md`): monorepo, scraper (fetch+cheerio), SQLite-схема
з 4 таблиць, upsert-нормалізація, REST (CRUD searches + scan + listings), CLI-скан і сира
React-таблиця.

**Поза скоупом Етапу 1** (не реалізовувати): статус-логіка/auto-disable, нотатки,
інлайн-едіт, локальні range-фільтри, `price_history`-запис, спарклайни, Notion, cron.
Таблиці/поля під них створюються (схема повна), але код їх не чіпає: `filtered_out=0`,
`status='new'`, у `price_history` не пишемо.

## Стек і пакети (фіксовано каноном)

- **root** (dev): `concurrently` — паралельний dev-раннер.
- **server/** deps: `fastify`, `@fastify/cors`, `better-sqlite3`, `cheerio`;
  dev: `typescript`, `tsx`, `@types/node`, `@types/better-sqlite3`.
  Dev-запуск: `tsx watch src/index.ts`; CLI: `tsx src/scan.ts`.
- **web/** deps: `react`, `react-dom`, `@tanstack/react-query`, `@tanstack/react-table`;
  dev: `vite`, `@vitejs/plugin-react`, `typescript`, `@types/react`, `@types/react-dom`,
  `tailwindcss`, `@tailwindcss/vite` (Tailwind v4 через Vite-плагін, мінімум конфігу).

> ⚠️ `better-sqlite3` — нативний модуль; на Windows для `npm install` потрібні build-tools
> (VS C++ Build Tools + Python) або prebuilt-бінарник. Якщо install впаде на компіляції —
> зупинитися й показати помилку, не міняти БД-движок без підтвердження.

---

## Група 0 — root

- [x] `package.json` — `workspaces: ["server","web"]`, `private:true`, скрипти:
  - [x] `dev` → `concurrently -n server,web "npm:dev:server" "npm:dev:web"`
  - [x] `dev:server` → `npm -w server run dev`
  - [x] `dev:web` → `npm -w web run dev`
  - [x] `build` → `npm -w server run build && npm -w web run build`
  - [x] `scan` → `npm -w server run scan --`
- [x] `.gitignore` — додати `server/data/*.db`, `server/data/*.db-*`
- [x] `tsconfig.base.json` — strict, спільні compilerOptions

## Група 1 — db (server) → коміт

- [x] `server/src/db/schema.sql` — рівно 4 таблиці зі спеки §5 (`searches`, `listings`,
  `price_history`, `scan_runs`), кожна `CREATE TABLE IF NOT EXISTS`, CHECK на `status`.
- [x] `server/src/db/db.ts` — `better-sqlite3`, файл `server/data/olx.db` (створити теку `data/`),
  `journal_mode = WAL`, прочитати й виконати `schema.sql`. Експорт singleton `db`.
- [x] `server/src/types.ts` — доменні типи: `SearchConfig`, `RawListing`, `ListingRow`,
  `ScanResult`, інтерфейс `OlxFetcher`. Без `any`.
- [x] `server/package.json` + `server/tsconfig.json`

## Група 2 — scraper (server) → коміт

- [x] `server/src/scraper/selectors.ts` — усі OLX-селектори в одному об'єкті.
- [x] `server/src/scraper/olxFetcher.ts` — `class HtmlOlxFetcher implements OlxFetcher`:
  - [x] URL-білдер з `SearchConfig` (base + `filter_float_*:from/:to`, `filter_enum_*`,
    `private_business`, `page=N`)
  - [x] заголовки `User-Agent`/`Referer`/`X-Client: DESKTOP`
  - [x] ≤3 сторінки, затримка 1–2 с, стоп на `empty-state`/0 карток
  - [x] парсинг cheerio → `RawListing[]`
  - [x] guard: HTML без карток і без empty-state → зупинитися й показати зразок
    (перевірити `__NEXT_DATA__`), Playwright НЕ додавати
- [x] `server/src/scraper/normalizer.ts`:
  - [x] `parsePrice("6 000 грн.")` → `{price, currency}`, абсолютизація лінка, `olx_id`
  - [x] `upsertListings(searchId, raw[])` — `INSERT ... ON CONFLICT(olx_id) DO UPDATE`;
    `price_history`/`filtered_out` НЕ чіпати. Повертає `{found, new_count}`.
  - [x] `scanner.ts` — спільна логіка скану (route + CLI), запис `scan_runs`

## Група 3 — routes + bootstrap + CLI (server) → коміт

- [x] `server/src/routes/searches.ts` — `GET/POST/PATCH/DELETE /api/searches[/:id]` +
  `POST /api/searches/:id/scan` (запис `scan_runs`, fetcher→normalizer, помилка → `scan_runs.error`,
  процес не падає, повертає `{found, new_count}`)
- [x] `server/src/routes/listings.ts` — `GET /api/searches/:id/listings` (сортування з query)
- [x] `server/src/index.ts` — Fastify bootstrap, `@fastify/cors` для `localhost:5173`, `:3001`
- [x] `server/src/scan.ts` — CLI `npm run scan -- --search <id>`

## Група 4 — web → коміт

- [x] `web/package.json`, `web/tsconfig.json`, `web/vite.config.ts` (React + Tailwind plugin,
  proxy `/api` → `:3001`), `web/index.html`, `web/src/main.tsx` (QueryClientProvider),
  `web/src/index.css` (`@import "tailwindcss";`)
- [x] `web/src/api/client.ts` — fetch-обгортка + хуки `useSearches`/`useCreateSearch`/`useScan`/`useListings`
- [x] `web/src/pages/Searches.tsx` — список + форма (name, query, price from/to → `api_filters.price`) + кнопка Scan
- [x] `web/src/pages/ListingsTable.tsx` — TanStack Table: фото, назва (лінк), ціна, місто, дата; сортування
- [x] `web/src/App.tsx` — композиція списку пошуків + таблиці

---

## Перевірка (end-to-end)

- [x] `npm install` (root workspaces) проходить (better-sqlite3 — prebuilt, без компіляції)
- [x] `npm run build` — server (tsc) + web (tsc+vite) без помилок
- [x] Сервер стартує `:3001`, `/health` OK, схема застосовується
- [x] API: створити search `iphone 13` (8000–15000) → Scan → `found=145`
- [x] Повторний Scan → `new_count=0` (дедуплікація по `olx_id` працює)
- [x] Заголовки/ціни/міста/дати парсяться (виправлено селектор заголовка `h6`→`h6, h4`)
- [ ] Ручна перевірка UI (`npm run dev`, форма + таблиця в браузері)
- [ ] CLI: `npm run scan -- --search 1` (логіка спільна зі скан-роутом через `scanner.ts`)

> Якщо парсинг дає 0 при непорожній видачі → перша гіпотеза: JS-only сторінка.
> Перевірити `__NEXT_DATA__` і показати зразок ПЕРЕД будь-яким браузером (Playwright заборонено).
