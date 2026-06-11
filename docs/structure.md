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
│   ├── olx-api.md                    # API OLX: GraphQL (основний) + HTML fallback
│   ├── olx-graphql-fields-reference.md # довідник усіх полів GraphQL-відповіді (introspection вимкнено)
│   ├── structure.md                  # цей файл
│   ├── claude-code-scaffold-prompt.md# промпт-скаффолд Етапу 1
│   └── plans/
│       ├── initial-mvp.md            # план Етапу 1 із чекбоксами прогресу
│       ├── graphql-migration.md      # план міграції збору на GraphQL (інструкція виконавцю)
│       └── TODO                      # робочий список дрібних UI/UX-задач із чекбоксами
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
│       │   ├── graphqlOlxFetcher.ts # GraphqlOlxFetcher: GraphQL API (основний метод)
│       │   ├── selectors.ts  # OLX-селектори + заголовки HTML-запиту (fallback)
│       │   ├── olxFetcher.ts # HtmlOlxFetcher: URL-білдер, fetch, cheerio (fallback)
│       │   └── normalizer.ts # upsert по olx_id; parsePrice/локація для HTML-шляху
│       └── routes/
│           ├── searches.ts   # CRUD /api/searches + POST /scan
│           └── listings.ts   # GET /api/searches/:id/listings
│
└── web/                      # workspace "web" (React + Vite), type: module
    ├── package.json          # deps: react, @tanstack/react-query, @tanstack/react-table,
    │                          #   @chakra-ui/react, next-themes, react-icons
    ├── tsconfig.json         # module: ESNext, moduleResolution: Bundler, jsx
    ├── vite.config.ts        # react plugin, proxy /api → :3001
    ├── index.html            # точка входу Vite
    └── src/
        ├── main.tsx          # ReactDOM + ChakraProvider + QueryClientProvider
        ├── App.tsx           # шапка (лого + SettingsDrawer) + Searches (sidebar) + ListingsTable;
        │                      #   стан columnVisibility
        ├── api/
        │   └── client.ts     # fetch-обгортка + TanStack Query хуки (DTO-типи імпортуються з web/src/types)
        ├── components/
        │   ├── SettingsDrawer.tsx # Drawer "Налаштування": тема (light/dark) + видимість колонок
        │   ├── table/             # компоненти таблиці оголошень
        │   │   ├── HeaderLabel.tsx # заголовок колонки з іконкою
        │   │   ├── columns.tsx     # опис колонок (TanStack Table) та TOGGLEABLE_COLUMNS
        │   │   ├── ListingsTableHeader.tsx # заголовок таблиці з ресайзером
        │   │   └── ListingsTableBody.tsx # тіло таблиці (відображення рядків)
        │   └── ui/                # Chakra UI v3 snippets
        │       ├── provider.tsx
        │       ├── color-mode.tsx
        │       ├── toaster.tsx
        │       ├── tooltip.tsx
        │       ├── drawer.tsx
        │       ├── switch.tsx
        │       ├── checkbox.tsx
        │       └── close-button.tsx
        ├── hooks/
        │   └── useListingsTableState.ts # збереження/завантаження стану таблиці (сортування, sizing)
        ├── pages/
        │   ├── Searches.tsx      # список пошуків, форма створення, кнопка Scan
        │   └── ListingsTable.tsx # відображення таблиці оголошень (компонування)
        ├── types/
        │   └── index.ts          # спільні типи фронтенду (Listing, Search, StoredTableState тощо)
        └── utils/
            ├── format.ts         # хелпери форматування (ціна, дата, чистка HTML-опису)
            └── storage.ts        # збереження/завантаження налаштувань (columnVisibility, tableState) у localStorage
```

## Орієнтири «куди дивитись»

| Завдання | Файли |
| --- | --- |
| GraphQL-запит до OLX (основний збір) | `server/src/scraper/graphqlOlxFetcher.ts` + `docs/olx-api.md` §2 |
| Змінити OLX-селектори/заголовки (HTML fallback) | `server/src/scraper/selectors.ts` |
| Логіка побудови URL / парсингу HTML-списку | `server/src/scraper/olxFetcher.ts` |
| Нормалізація/дедуплікація | `server/src/scraper/normalizer.ts` |
| Порядок стратегій збору / fallback | `server/src/scanner.ts` |
| Схема БД | `server/src/db/schema.sql` (+ `db.ts` для застосування) |
| Нові API-ендпойнти | `server/src/routes/*.ts`, реєстрація в `server/src/index.ts` |
| Доменні типи | `server/src/types.ts` (бек), `web/src/types/index.ts` (фронт) |
| Запити з фронту | `web/src/api/client.ts` |
| UI-сторінки | `web/src/pages/*.tsx`, `web/src/App.tsx` |
| Налаштування вигляду (тема, видимість колонок) | `web/src/components/SettingsDrawer.tsx`, `web/src/App.tsx` (стан), `web/src/utils/storage.ts` (localStorage), `TOGGLEABLE_COLUMNS` у `web/src/components/table/columns.tsx` |
| Скрипти/воркспейси | кореневий `package.json` |
