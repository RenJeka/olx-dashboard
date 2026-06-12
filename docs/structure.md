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
│       ├── scanner.ts        # runScan(): спільна логіка скану (роут + CLI) + applyScanStatuses, scan_runs.kind
│       ├── scan.ts           # CLI: npm run scan -- --search <id>
│       ├── db/
│       │   ├── schema.sql    # КАНОН схеми БД (4 таблиці) — джерело істини
│       │   └── db.ts         # відкриття БД, WAL, застосування schema.sql, міграції (addColumnIfMissing/migrateListingsTable)
│       ├── scraper/
│       │   ├── graphqlOlxFetcher.ts # GraphqlOlxFetcher: GraphQL API (основний метод), exhausted-флаг
│       │   ├── selectors.ts  # OLX-селектори + заголовки HTML-запиту (fallback)
│       │   ├── olxFetcher.ts # HtmlOlxFetcher: URL-білдер, fetch, cheerio (fallback)
│       │   ├── normalizer.ts # upsert по olx_id; olx_status auto-disable; filtered_out
│       │   ├── statusEngine.ts # applyScanStatuses(): вікно покриття, miss_count, auto-disable/reactivate (Етап 2)
│       │   └── localFilters.ts # evaluateFilteredOut(): exclude_keywords + range-правила local_filters (Етап 2)
│       └── routes/
│           ├── searches.ts   # CRUD /api/searches (каскадний DELETE) + POST /scan(+deep) + scan-status + move + param-keys + stats + PATCH (filters)
│           └── listings.ts   # GET /api/searches/:id/listings + PATCH /api/listings/:id (статус/нотатка)
│
└── web/                      # workspace "web" (React + Vite), type: module
    ├── package.json          # deps: react, @tanstack/react-query, @tanstack/react-table,
    │                          #   @chakra-ui/react, next-themes, react-icons
    ├── tsconfig.json         # module: ESNext, moduleResolution: Bundler, jsx
    ├── vite.config.ts        # react plugin, proxy /api → :3001
    ├── index.html            # точка входу Vite
    └── src/
        ├── main.tsx          # ReactDOM + ChakraProvider + QueryClientProvider
        ├── App.tsx           # шапка (лого + SettingsDrawer) + Searches (sidebar) + SearchActionPanel + ListingsTable;
        │                      #   стан columnVisibility, автооновлення (useAutoRefresh)
        ├── api/
        │   └── client.ts     # fetch-обгортка + TanStack Query хуки (CRUD, scan(+deep)/scan-status, статуси/нотатки/масові
        │                      #   дії, filters/param-keys/stats; DTO-типи з web/src/types)
        ├── components/
        │   ├── SettingsDrawer.tsx # Drawer "Налаштування": тема (light/dark), видимість колонок, перемикач опису, автооновлення
        │   ├── DescriptionDialog.tsx # модалка повного опису оголошення (фото/ціна/опис/посилання)
        │   ├── SearchActionPanel.tsx # панель дій активного пошуку: скан/глибокий скан, прогрес, лічильники
        │   ├── SearchFiltersDrawer.tsx # Drawer "Фільтри пошуку": api_filters + local_filters (exclude_keywords, ranges)
        │   ├── ConfirmActionDialog.tsx # узагальнена alertdialog-модалка підтвердження (видалення тощо)
        │   ├── table/             # компоненти таблиці оголошень
        │   │   ├── HeaderLabel.tsx # заголовок колонки з іконкою
        │   │   ├── columns.tsx     # опис колонок (TanStack Table), колонка select, TOGGLEABLE_COLUMNS
        │   │   ├── ListingsTableHeader.tsx # заголовок таблиці з ресайзером (onEnd)
        │   │   ├── ListingsTableBody.tsx # тіло таблиці (відображення рядків)
        │   │   ├── ListingsTableRow.tsx # рядок таблиці (React.memo), приглушений стиль для disabled/rejected
        │   │   ├── StatusCell.tsx # інлайн-едіт статусу (NativeSelect) + status_source
        │   │   ├── NoteCell.tsx   # інлайн-едіт нотатки (Popover + textarea)
        │   │   ├── HighlightText.tsx # підсвітка збігів пошукового запиту (Mark)
        │   │   ├── ListingsFilterBar.tsx # рядок фільтрів: статус (SegmentGroup), "показати filtered_out", пошук
        │   │   ├── BulkActionBar.tsx # панель масових дій над виділеними рядками (зміна статусу)
        │   │   ├── DescriptionTooltip.tsx # тултіп для попереднього перегляду опису
        │   │   └── TablePagination.tsx # панель пагінації (Chakra Pagination + вибір pageSize)
        │   └── ui/                # Chakra UI v3 snippets
        │       ├── provider.tsx
        │       ├── color-mode.tsx
        │       ├── toaster.tsx
        │       ├── tooltip.tsx
        │       ├── drawer.tsx
        │       ├── dialog.tsx     # також основа для ConfirmActionDialog
        │       ├── switch.tsx
        │       ├── checkbox.tsx
        │       └── close-button.tsx
        ├── hooks/
        │   ├── useListingsTableState.ts # збереження/завантаження стану таблиці (сортування, sizing)
        │   └── useAutoRefresh.ts # періодичний автоскан усіх пошуків (інтервал з налаштувань, пауза 5-10с між пошуками)
        ├── pages/
        │   ├── Searches.tsx      # список пошуків (акордеон), форма створення, сортування ↑/↓, 3-dot меню (фільтри/видалення)
        │   └── ListingsTable.tsx # таблиця оголошень + ListingsFilterBar + BulkActionBar + DescriptionDialog
        ├── types/
        │   └── index.ts          # спільні типи фронтенду (Listing, ListingStatus, Search, StoredTableState тощо)
        └── utils/
            ├── format.ts         # хелпери форматування (ціна, дата/відносний час, чистка HTML-опису)
            ├── status.ts         # STATUS_LABELS/STATUS_COLORS, isMutedStatus()
            └── storage.ts        # збереження/завантаження налаштувань (columnVisibility, tableState, автооновлення) у localStorage
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
| Статуси оголошень (вікно покриття, `miss_count`, `olx_status`-disable, ручний override) | `server/src/scraper/statusEngine.ts`, `server/src/scraper/normalizer.ts`, `docs/olx-monitor-spec.md` §6 |
| Локальні фільтри (`exclude_keywords`, range-правила, `filtered_out`) | `server/src/scraper/localFilters.ts`, `web/src/components/SearchFiltersDrawer.tsx` |
| Інлайн-едіт статусу/нотатки, масові дії, фільтри таблиці | `web/src/components/table/StatusCell.tsx`, `NoteCell.tsx`, `BulkActionBar.tsx`, `ListingsFilterBar.tsx` |
| Глибокий скан / прогрес сканування | `server/src/scanner.ts`, `web/src/components/SearchActionPanel.tsx`, `GET /api/searches/:id/scan-status` |
| Автооновлення (фон) | `web/src/hooks/useAutoRefresh.ts`, `web/src/components/SettingsDrawer.tsx`, `web/src/utils/storage.ts` |
| Скрипти/воркспейси | кореневий `package.json` |
