# Структура проєкту — OLX Dashboard

> Дерево файлів і призначення кожного елемента. Технічний огляд — у
> [`architecture.md`](./architecture.md); вимоги/рішення — у [`olx-monitor-spec.md`](./olx-monitor-spec.md).

## Дерево

```
olx-dashboard/
├── package.json              # root workspace: скрипти dev/build/scan/migrate:posted-at, deps: concurrently
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
│       ├── graphql-offset-window.md  # план: вікно пагінації GraphQL (offset≤1000), частковий успіх, нормалізація posted_at
│       └── TODO                      # робочий список дрібних UI/UX-задач із чекбоксами
│
├── server/                   # workspace "server" (Node + Fastify), type: module
│   ├── package.json          # deps: fastify, @fastify/cors, better-sqlite3, cheerio, exceljs, archiver
│   ├── tsconfig.json         # module/moduleResolution: NodeNext, emit у dist/
│   ├── scripts/
│   │   └── copyAssets.mjs    # postbuild: копіює не-TS асети (schema.sql, analyze.py) у dist (tsc їх не копіює)
│   ├── data/
│   │   └── olx.db            # SQLite (gitignored, створюється при старті)
│   └── src/
│       ├── index.ts          # Fastify bootstrap, CORS :5173, /health, listen :3001
│       ├── types.ts          # доменні типи + інтерфейс OlxFetcher
│       ├── scanner.ts        # runScan(): спільна логіка скану (роут + CLI) + applyScanStatuses, scan_runs.kind
│       ├── scan.ts           # CLI: npm run scan -- --search <id>
│       ├── migratePostedAt.ts # CLI одноразова міграція: текстовий posted_at (HTML-fallback) → ISO, npm run migrate:posted-at
│       ├── db/
│       │   ├── schema.sql    # КАНОН схеми БД (4 таблиці) — джерело істини
│       │   └── db.ts         # відкриття БД, WAL, застосування schema.sql, міграції (addColumnIfMissing/migrateListingsTable)
│       ├── analysis/        # LLM-аналіз (план docs/plans/llm-analysis.md, доповнено docs/plans/analysis-wizard-review-rework.md)
│       │   ├── constants.ts  # magic-значення (моделі, ліміти, чанки, MIME, ANALYSIS_ERRORS) + isMode() type guard
│       │   ├── config.ts     # завантаження server/.env (process.loadEnvFile) + hasApiKey/getApiKey
│       │   ├── repo.ts       # DB-шар: ListingRow, getSearch/getSavedCriteria/loadListings
│       │   ├── promptData.ts # трансформації для промптів: toPromptListing/descriptionMap/chunk + ANALYZE_PY_PATH
│       │   ├── prompts.ts    # buildCriteriaPrompt/buildMatchingPrompt/pickSample/buildManualZipInstructions/buildChunkListings/PATTERNS_EXAMPLE_JSON — ЄДИНЕ джерело промптів
│       │   ├── analyze.py     # готовий детермінований Python-движок для ZIP-пакета ручного режиму (regex-матчинг, клауза-скоуп заперечення, морфологічні стеми, evidence з опису, без stdout); кладеться в ZIP
│       │   ├── openrouter.ts # chat() — POST /chat/completions (json_object, ретрай, зняття code-fence)
│       │   ├── parse.ts      # парс відповідей LLM + верифікація evidence (substring) + мерж результатів
│       │   ├── text.ts       # stripHtml/normalizeForMatch/evidenceConfirmed/parseBullets
│       │   └── aiPicks.ts    # AI Вибір (план docs/plans/AI-auto-top.md): buildPickPrompt/parsePickResponse/runAiPicks/toPickItems/buildPickManualZipInstructions (2-етапні map-reduce інструкції для ZIP ручного режиму)
│       ├── export/
│       │   └── xlsx.ts       # buildXlsxBuffer (ExcelJS) — спільний Excel-експорт
│       ├── scraper/
│       │   ├── graphqlOlxFetcher.ts # GraphqlOlxFetcher: GraphQL API (основний метод), exhausted-флаг
│       │   ├── selectors.ts  # OLX-селектори + заголовки HTML-запиту (fallback)
│       │   ├── olxFetcher.ts # HtmlOlxFetcher: URL-білдер, fetch, cheerio (fallback)
│       │   ├── dateParser.ts # parseOlxDate(): текстові дати HTML-fallback → ISO ("Сьогодні/Вчора о HH:MM", "D <місяць> YYYY р.")
│       │   ├── normalizer.ts # upsert по olx_id; olx_status auto-disable; filtered_out; postedAt HTML-fallback через parseOlxDate
│       │   ├── statusEngine.ts # applyScanStatuses(): вікно покриття, miss_count, auto-disable/reactivate (Етап 2)
│       │   ├── localFilters.ts # evaluateFilteredOut(): price_range/cities/sellers local_filters (Етап 2; стоп-слова+ranges по params закомментовано)
│       │   └── verifier.ts   # probeListingPage(): проба сторінки оголошення, детект мертвих/живих (Етап 2, A3)
│       └── routes/
│           ├── searches.ts   # CRUD /api/searches (каскадний DELETE) + POST /scan(+deep)/verify + scan-status + move + param-keys + filter-options + stats + PATCH (filters)
│           ├── listings.ts   # GET /api/searches/:id/listings + PATCH /api/listings/:id (статус/нотатка)
│           ├── aiPicks.ts    # AI Вибір: GET .../ai-picks/prompt + .../ai-picks/package.zip (ZIP map-reduce, пули >50) + POST .../ai-picks/rank(авто)/import(ручний)/commit
│           └── analysis/     # LLM-аналіз (розбитий на файли за призначенням)
│               ├── index.ts  # реєструє всі роути + GET /api/analysis/status (A1)
│               ├── criteria.ts # A4: GET/PUT /criteria, POST .../generate/.../import, GET .../prompt
│               ├── matching.ts # A5: POST /analyze, GET /analyze/package.zip, POST /analyze/import+export
│               └── commit.ts   # POST /api/listings/analyze/commit (запис cons/pros у БД)
│
└── web/                      # workspace "web" (React + Vite), type: module
    ├── package.json          # deps: react, @tanstack/react-query, @tanstack/react-table,
    │                          #   @chakra-ui/react, next-themes, react-icons, zustand
    ├── tsconfig.json         # module: ESNext, moduleResolution: Bundler, jsx
    ├── vite.config.ts        # react plugin, proxy /api → :3001
    ├── index.html            # точка входу Vite
    └── src/
        ├── main.tsx          # ReactDOM + ChakraProvider + QueryClientProvider
        ├── App.tsx           # компоновка сторінки (Header, Searches sidebar, ListingsTable);
        │                      #   стан columnVisibility, автооновлення (useAutoRefresh)
        ├── constants.ts      # magic-значення фронту (ключі localStorage, дефолти, константи LLM-аналізу)
        ├── api/
        │   └── client.ts     # fetch-обгортка + TanStack Query хуки (CRUD, scan(+deep)/verify/scan-status, статуси/нотатки/масові
        │                      #   дії, filters/filter-options/stats; DTO-типи з web/src/types)
        ├── components/
        │   ├── Searches.tsx      # бічна панель (акордеон пошуків), сортування ↑/↓, 3-dot меню (фільтри/видалення)
        │   ├── Header.tsx        # шапка (кнопка бічної панелі, SearchActionPanel-модалка, SettingsDrawer)
        │   ├── analysis/        # майстер LLM-аналізу (плани docs/plans/llm-analysis.md, docs/plans/analysis-wizard-review-rework.md)
        │   │   ├── AnalysisWizardDialog.tsx # 4-етапний майстер «AI» (критерії→пошук→перевірка→вставка); крок 1 — вибір режиму cons/pros та scope (вибрані/вкладка/весь пошук); кроки 2–4 — read-only підсумок; прогрес зберігається між відкриттями (Zustand in-memory); закриття повз вікно заборонено
        │   │   ├── ManualAssistant.tsx      # бічна панель-помічник ручного режиму (копіювати/завантажити промпт(и) + вставити відповідь, опціональний emptyHint)
        │   │   ├── AiPicksDialog.tsx        # AI Вибір (план docs/plans/AI-auto-top.md): запуск/імпорт ранжування, ручний режим — один промпт (≤50 кандидатів) або ZIP-пакет map-reduce (>50, useZip), коміт результату
        │   │   └── AiRankCard.tsx           # картка одного AI-обраного оголошення (rank/reason) у результаті AiPicksDialog
        │   ├── settings/         # папка компонентів налаштувань
        │   │   ├── SettingsDrawer.tsx # Drawer "Налаштування", об'єднує секції з sections/
        │   │   └── sections/
        │   │       ├── VisualSection.tsx      # секція "Візуальний вигляд" (тема, розширений опис)
        │   │       ├── AutoRefreshSection.tsx # секція "Автооновлення" (перемикач, інтервал)
        │   │       ├── AnalysisSection.tsx    # секція "AI-аналіз" (статус ключа, модель, reasoning, додаткові критерії)
        │   │       └── ColumnsSection.tsx     # секція "Колонки таблиці" (перевпорядкування drag-and-drop, видимість колонок)
        │   ├── DescriptionDialog.tsx # модалка повного опису оголошення (фото/ціна/опис/посилання)
        │   ├── SearchActionPanel.tsx # модальне вікно (DialogRoot) дій активного пошуку (скан/verify, статистика)
        │   ├── SearchFiltersDrawer.tsx # Drawer "Фільтри пошуку": local_filters (price_range, cities, sellers; стоп-слова/ranges закомментовано)
        │   ├── ConfirmActionDialog.tsx # узагальнена alertdialog-модалка підтвердження (видалення тощо)
        │   ├── table/             # компоненти таблиці оголошень
        │   │   ├── HeaderLabel.tsx # заголовок колонки з іконкою
        │   │   ├── columns.tsx     # опис колонок (TanStack Table), колонка select, TOGGLEABLE_COLUMNS
        │   │   ├── ListingsTableHeader.tsx # заголовок таблиці з ресайзером (onEnd)
        │   │   ├── ListingsTableBody.tsx # тіло таблиці (відображення рядків)
        │   │   ├── ListingsTableRow.tsx # рядок таблиці (React.memo), приглушений стиль для disabled/rejected
        │   │   ├── StatusCell.tsx # інлайн-едіт статусу (NativeSelect) + status_source
        │   │   ├── NoteCell.tsx   # інлайн-едіт нотатки (Popover + textarea)
        │   │   ├── ProsConsCell.tsx # інлайн-едіт плюсів/мінусів (Popover + textarea)
        │   │   ├── HighlightText.tsx # підсвітка збігів пошукового запиту (Mark)
        │   │   ├── ListingsFilterBar.tsx # рядок фільтрів: статус (SegmentGroup з useListingsUiStore), "показати filtered_out", пошук
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
        ├── stores/
        │   ├── listingsUiStore.ts     # useListingsUiStore: statusFilter (вкладка таблиці) — спільний стан між таблицею і AI-майстром
        │   └── analysisWizardStore.ts # useAnalysisWizardStore: прогрес AI-Flow (mode/scope/step/критерії/результати); bindSearch/reset
        ├── hooks/
        │   ├── useListingsTableState.ts # збереження/завантаження стану таблиці (сортування, sizing)
        │   ├── useAutoRefresh.ts # періодичний автоскан усіх пошуків (інтервал з налаштувань, пауза 5-10с між пошуками)
        │   └── useIsMobile.ts    # useBreakpointValue < md (768px) — для responsive JS-розгалужень
        ├── pages/
        │   └── ListingsTable.tsx # таблиця оголошень + ListingsFilterBar + BulkActionBar + DescriptionDialog
        ├── types/
        │   └── index.ts          # спільні типи фронтенду (Listing, ListingStatus, Search, StoredTableState тощо)
        └── utils/
            ├── format.ts         # хелпери форматування (ціна, дата/відносний час, чистка HTML-опису)
            ├── status.ts         # STATUS_LABELS/STATUS_COLORS, isMutedStatus()
            ├── storage.ts        # збереження/завантаження налаштувань (columnVisibility, tableState, автооновлення, AI-аналіз) у localStorage
            ├── text.ts           # escapeRegExp() — спільне для HighlightText та підсвітки evidence
            ├── array.ts          # chunk() — клієнтське чанкування запитів/записів
            ├── download.ts       # downloadBlob()/downloadText() — завантаження файлів (експорт, ручний пакет)
            └── clipboard.ts      # copyToClipboard() — копіювання + toast «Скопійовано»
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
| Налаштування вигляду (тема, видимість колонок) | `web/src/components/settings/SettingsDrawer.tsx` (із секціями в `settings/sections/`), `web/src/App.tsx` (стан), `web/src/utils/storage.ts` (localStorage), `TOGGLEABLE_COLUMNS` у `web/src/components/table/columns.tsx` |
| Статуси оголошень (вікно покриття, `miss_count`, `olx_status`-disable, ручний override) | `server/src/scraper/statusEngine.ts`, `server/src/scraper/normalizer.ts`, `docs/olx-monitor-spec.md` §6 |
| Локальні фільтри (`price_range`, `cities`, `sellers`, `filtered_out`) | `server/src/scraper/localFilters.ts`, `web/src/components/SearchFiltersDrawer.tsx`, `GET /api/searches/:id/filter-options` |
| Інлайн-едіт статусу/нотатки/плюсів, масові дії, фільтри таблиці | `web/src/components/table/StatusCell.tsx`, `NoteCell.tsx`, `ProsConsCell.tsx`, `BulkActionBar.tsx`, `ListingsFilterBar.tsx` |
| Глибокий скан / прогрес сканування | `server/src/scanner.ts`, `web/src/components/SearchActionPanel.tsx`, `GET /api/searches/:id/scan-status` |
| Verify-прохід (детект неактивних, дозаповнення опису/продавця) | `server/src/scraper/verifier.ts`, `server/src/scanner.ts` (`runVerify`), `POST /api/searches/:id/verify`, `web/src/components/SearchActionPanel.tsx` |
| Нормалізація дат HTML-fallback (`posted_at`), вікно пагінації GraphQL | `server/src/scraper/dateParser.ts`, `server/src/scraper/graphqlOlxFetcher.ts`, `server/src/migratePostedAt.ts` |
| Автооновлення (фон) | `web/src/hooks/useAutoRefresh.ts`, `web/src/components/SettingsDrawer.tsx` (секція `AutoRefreshSection`), `web/src/utils/storage.ts` |
| LLM-аналіз (мінуси/плюси, OpenRouter + ручний режим) | `server/src/analysis/*`, `server/src/routes/analysis/*`, `server/src/export/xlsx.ts`, `web/src/components/analysis/*`, `web/src/components/settings/sections/AnalysisSection.tsx` + `docs/plans/llm-analysis.md` |
| Скрипти/воркспейси | кореневий `package.json` |
