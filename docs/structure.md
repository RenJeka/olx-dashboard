# Структура проєкту — OLX Monitor

> Дерево файлів і призначення кожного елемента. Технічний огляд — у
> [`architecture.md`](./architecture.md); вимоги/рішення — у [`olx-monitor-spec.md`](./olx-monitor-spec.md).

## Дерево

```
olx-dashboard/
├── package.json              # root workspace: скрипти dev/build/scan, deps: concurrently
├── package-lock.json
├── tsconfig.base.json        # спільні strict-опції TS (без module/moduleResolution)
├── .gitignore                # + server/data/*.db, *.db-shm, *.db-wal
├── CLAUDE.md                 # канон інваріантів/конвенцій для агентів
├── README.md                 # огляд + швидкий старт
│
├── docs/
│   ├── olx-monitor-spec.md           # канонічна специфікація (вимоги, схема, етапи)
│   ├── architecture.md               # технічна архітектура (цей рівень опису)
│   ├── structure.md                  # цей файл
│   ├── claude-code-scaffold-prompt.md# промпт-скаффолд Етапу 1
│   └── plans/
│       └── initial-mvp.md            # план Етапу 1 із чекбоксами прогресу
│
├── server/                   # workspace "server" (Node + Fastify), type: module
│   ├── package.json          # deps: fastify, @fastify/cors, better-sqlite3, cheerio
│   ├── tsconfig.json         # module/moduleResolution: NodeNext, emit у dist/
│   ├── data/
│   │   └── olx.db            # SQLite (gitignored, створюється при старті)
│   └── src/
│       ├── index.ts          # Fastify bootstrap, CORS :5173, /health, listen :3001
│       ├── types.ts          # доменні типи + інтерфейс OlxFetcher
│       ├── scanner.ts        # runScan(): спільна логіка скану (роут + CLI)
│       ├── scan.ts           # CLI: npm run scan -- --search <id>
│       ├── db/
│       │   ├── schema.sql    # КАНОН схеми БД (4 таблиці) — джерело істини
│       │   └── db.ts         # відкриття БД, WAL, застосування schema.sql
│       ├── scraper/
│       │   ├── selectors.ts  # усі OLX-селектори + заголовки запиту
│       │   ├── olxFetcher.ts # HtmlOlxFetcher: URL-білдер, fetch, cheerio-парсинг
│       │   └── normalizer.ts # parsePrice, розбір локації, upsert по olx_id
│       └── routes/
│           ├── searches.ts   # CRUD /api/searches + POST /scan
│           └── listings.ts   # GET /api/searches/:id/listings
│
└── web/                      # workspace "web" (React + Vite), type: module
    ├── package.json          # deps: react, @tanstack/react-query, @tanstack/react-table
    ├── tsconfig.json         # module: ESNext, moduleResolution: Bundler, jsx
    ├── vite.config.ts        # react + tailwind plugin, proxy /api → :3001
    ├── index.html            # точка входу Vite
    └── src/
        ├── main.tsx          # ReactDOM + QueryClientProvider
        ├── App.tsx           # композиція: Searches (sidebar) + ListingsTable
        ├── index.css         # @import "tailwindcss"
        ├── api/
        │   └── client.ts     # fetch-обгортка + TanStack Query хуки + DTO-типи
        └── pages/
            ├── Searches.tsx      # список пошуків, форма створення, кнопка Scan
            └── ListingsTable.tsx # TanStack Table з сортуванням
```

## Орієнтири «куди дивитись»

| Завдання | Файли |
| --- | --- |
| Змінити OLX-селектори/заголовки | `server/src/scraper/selectors.ts` |
| Логіка побудови URL / парсингу списку | `server/src/scraper/olxFetcher.ts` |
| Нормалізація/дедуплікація | `server/src/scraper/normalizer.ts` |
| Схема БД | `server/src/db/schema.sql` (+ `db.ts` для застосування) |
| Нові API-ендпойнти | `server/src/routes/*.ts`, реєстрація в `server/src/index.ts` |
| Доменні типи | `server/src/types.ts` |
| Запити з фронту | `web/src/api/client.ts` |
| UI-сторінки | `web/src/pages/*.tsx`, `web/src/App.tsx` |
| Скрипти/воркспейси | кореневий `package.json` |

## Команди

```bash
npm install                     # встановити залежності обох воркспейсів
npm run dev                     # server (:3001) + web (:5173) паралельно
npm run dev:server              # лише backend
npm run dev:web                 # лише frontend
npm run build                   # tsc (server) + tsc/vite (web)
npm run scan -- --search <id>   # CLI-скан без UI
```
