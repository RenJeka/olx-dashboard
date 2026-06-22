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
│   └── plans/                        # плани реалізації
│       ├── old/                      # старі плани
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
│       │   ├── prompts.ts    # buildCriteriaPrompt/buildMatchingPrompt/pickSample/buildManualZipInstructions/buildChunkListings/buildSynonymsPrompt/PATTERNS_EXAMPLE_JSON — ЄДИНЕ джерело промптів
│       │   ├── analyze.py     # готовий детермінований Python-движок для ZIP-пакета ручного режиму (regex-матчинг, клауза-скоуп заперечення, морфологічні стеми, evidence з опису, без stdout); кладеться в ZIP
│       │   ├── openrouter.ts # chat() — POST /chat/completions (json_object, ретрай, зняття code-fence)
│       │   ├── parse.ts      # парс відповідей LLM (критерії/matching/синоніми) + верифікація evidence (substring) + мерж результатів
│       │   ├── text.ts       # stripHtml/normalizeForMatch/evidenceConfirmed/parseBullets
│       │   ├── aiPicks.ts    # AI Вибір (план docs/plans/AI-auto-top.md): buildPickPrompt/parsePickResponse/runAiPicks/toPickItems/buildPickManualZipInstructions (2-етапні map-reduce інструкції для ZIP ручного режиму)
│       │   ├── relevance.ts  # семантичний фільтр: prefilterCandidates (евристичний пре-фільтр бренд+модель перед ШІ, тепер з aliases-синонімами), buildRelevancePrompt/parseRelevanceResponse/runRelevance/buildRelevanceZipInstructions (docs/plans/semantic-relevance-filter.md, docs/plans/search-synonyms.md)
│       │   ├── relevance_merge.py  # ZIP-скрипт ручного режиму: classifications/result-*.json → output.json
│       │   └── relevance_verify.py # ZIP-скрипт: перевірка, що output.json покриває всі id з descriptions/chunk-*.json
│       ├── export/
│       │   └── xlsx.ts       # buildXlsxBuffer (ExcelJS) — спільний Excel-експорт
│       ├── scraper/
│       │   ├── constants.ts    # спільні константи скраперів (BATCH_SIZE, затримки, USER_AGENT)
│       │   ├── utils.ts        # спільні утиліти (sleep, randomDelayMs, slugify)
│       │   ├── graphql/        # GraphQL-збирач (основний метод збору)
│       │   │   ├── index.ts    # реекспорт GraphqlOlxFetcher
│       │   │   ├── fetcher.ts  # GraphqlOlxFetcher: fetchSearch/fetchSearchSplit/probeMaxPrice, exhausted+aborted-флаги; analyzeSplit/scanFromPlan (двофазний deep-скан); shouldAbort у циклах (зупинка, docs/plans/deep-scan-stop-and-history.md)
│       │   │   ├── constants.ts # GraphQL-специфічні: URL, ліміти, query, split-пороги
│       │   │   └── types.ts    # типи відповіді GraphQL API (SearchParameter, GraphqlListing, PriceBucket)
│       │   ├── selectors.ts    # OLX-селектори + заголовки HTML-запиту (fallback)
│       │   ├── olxFetcher.ts   # HtmlOlxFetcher: URL-білдер, fetch, cheerio (fallback)
│       │   ├── dateParser.ts   # parseOlxDate(): текстові дати HTML-fallback → ISO ("Сьогодні/Вчора о HH:MM", "D <місяць> YYYY р.")
│       │   ├── normalizer.ts   # upsert по olx_id; olx_status auto-disable; filtered_out; postedAt HTML-fallback через parseOlxDate; selectKnownOlxIds (для оцінки ~нових у двофазному deep-скані)
│       │   ├── statusEngine.ts # applyScanStatuses(): вікно покриття, miss_count, auto-disable/reactivate (Етап 2)
│       │   ├── localFilters.ts # evaluateFilteredOut(): price_range/cities/sellers local_filters (Етап 2; стоп-слова+ranges по params закомментовано)
│       │   └── verifier.ts     # probeListingPage(): проба сторінки оголошення, детект мертвих/живих (Етап 2, A3)
│       └── routes/
│           ├── searches.ts   # CRUD /api/searches (каскадний DELETE) + POST /scan(+deep)/scan/analyze/scan/run-plan/verify + scan-status + move + param-keys + filter-options + stats + PATCH (filters, query_synonyms)
│           ├── listings.ts   # GET /api/searches/:id/listings + PATCH /api/listings/:id (статус/нотатка/плюси-мінуси/ai_relevant override)
│           ├── aiPicks.ts    # AI Вибір: GET .../ai-picks/prompt + .../ai-picks/package.zip (ZIP map-reduce, пули >50) + POST .../ai-picks/rank(авто)/import(ручний)/commit
│           ├── relevance.ts  # Семантичний фільтр: GET/PUT .../relevance/target, POST .../analyze/.../package.zip/.../import/.../commit (aliases з query_synonyms)
│           ├── searchSynonyms.ts # Синоніми пошукового запиту (docs/plans/search-synonyms.md), stateless: POST .../prompt/.../generate/.../import
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
        ├── theme/            # система стилів Chakra: єдина точка керування кольорами/розмірами
        │   ├── palette.ts    # ACCENT_BASE, FEEDBACK_BASE (success/warning/danger/info), THEME_PALETTES, STATUS_PALETTE
        │   ├── tokens.ts     # defineConfig: для кожної палітри (accent/success/warning/danger/info) числова шкала + семантичні аліаси на базу
        │   ├── system.ts     # createSystem(defaultConfig, customConfig) — підключається у ui/provider.tsx
        │   ├── layout.ts     # стильові константи розмірів/відступів (SIDEBAR_WIDTH, CONTENT_PAD_*, DIALOG_SIZE, DRAWER_SIZE)
        │   └── index.ts      # barrel
        ├── api/
        │   ├── index.ts      # барель-експорт усіх API хуків
        │   ├── base.ts       # fetch-обгортка api<T>
        │   ├── searches.ts   # CRUD пошуків, статистика
        │   ├── listings.ts   # оголошення, фільтри
        │   ├── scanner.ts    # скан, verify, прогрес сканування, useAnalyzeScan/useRunScanPlan (двофазний deep-скан)
        │   ├── analysis.ts   # LLM-аналіз (мінуси/плюси)
        │   ├── aiPicks.ts    # AI Вибір
        │   ├── relevance.ts  # семантичний фільтр
        │   └── synonyms.ts   # синоніми пошукового запиту
        ├── components/
        │   ├── searches/         # бічна панель «Пошуки» (акордеон + архів + форма створення), розбита на дрібні компоненти
        │   │   ├── Searches.tsx           # точка входу: mobile (Drawer) / desktop (aside), useNewSearchForm + SearchVariantsDialog для нового пошуку
        │   │   ├── SearchesPanel.tsx       # Accordion.Root: секції «Пошуки»/«Архів» + NewSearchForm
        │   │   ├── SearchGroupAccordionItem.tsx # спільна секція акордеону зі списком SearchRow (активні/архівовані)
        │   │   ├── NewSearchForm.tsx       # акордеон-секція форми створення пошуку (презентаційний, стан — useNewSearchForm)
        │   │   ├── SearchRow.tsx           # рядок пошуку: назва/запит/ціна, бейдж синонімів, реордер ↑/↓, SearchRowMenu
        │   │   ├── SearchRowMenu.tsx       # 3-dot меню рядка (редагувати/фільтри/варіанти/архів/видалення)
        │   │   ├── SearchDeleteDialog.tsx  # alert-діалог підтвердження видалення пошуку
        │   │   ├── SearchVariantsDialog.tsx # контрольований модал «Варіанти пошуку»: синоніми query (docs/plans/search-synonyms.md) — список + генерація авто/ручна (ManualAssistant)
        │   │   ├── SearchFiltersDrawer.tsx # Drawer "Фільтри пошуку" (обгортка)
        │   │   ├── local-filters/          # компоненти локальних фільтрів
        │   │   │   ├── PriceFilter.tsx     # фільтр діапазону цін
        │   │   │   └── TagsFilter.tsx      # універсальний фільтр тегів (міста, продавці, плюси/мінуси)
        │   │   ├── SearchEditDialog.tsx    # контрольований діалог «Редагувати пошук»: назва/запит/ціна/синоніми (docs/plans/search-row-edit.md)
        │   │   ├── SearchActionPanel.tsx   # модалка «Сканування та статистика»: стати + ScanProgressPanel + ActionPanelButtons + ConfirmActionDialog + ScanPlanReportDialog
        │   │   ├── action-panel/           # дрібні компоненти панелі дій (стан — useSearchActionPanel.ts)
        │   │   │   ├── ActionPanelStats.tsx      # картки лічильників (у БД / застарілі / verify-кандидати)
        │   │   │   ├── ActionPanelLastScan.tsx   # банер останнього скану (помилка/попередження, ScanWarningSummary)
        │   │   │   ├── ScanWarningSummary.tsx    # людино-зрозуміле зведення scan_runs.warning (стат-чипи + акордеон нотаток)
        │   │   │   ├── ActionPanelButtons.tsx    # 4 картки-кнопки: швидкий/глибокий скан, аналіз перед сканом, перевірка неактивних
        │   │   │   ├── ScanProgressPanel.tsx     # деталізований прогрес скану (сегментована смуга + ETA + кнопка «Зупинити»)
        │   │   │   └── ScanPlanReportDialog.tsx  # звіт двофазного deep-скану: ціновий спектр + ETA + розбивка по синонімах; «Зробити новий аналіз», planValid (docs/plans/deep-scan-stop-and-history.md)
        │   │   └── index.ts                # барель: export { Searches }
        │   ├── Header.tsx        # шапка (кнопка бічної панелі, SearchActionPanel-модалка, SettingsDrawer)
        │   ├── analysis/        # AI-workflow діалоги (кожен workflow — окрема директорія)
        │   │   ├── index.ts                 # барель-експорт головних діалогів (AnalysisWizardDialog, AiPicksDialog, RelevanceFilterDialog)
        │   │   ├── ManualAssistant.tsx      # спільна панель-помічник ручного режиму (копіювати/завантажити промпт(и) + вставити відповідь)
        │   │   ├── AiRankCard.tsx           # спільна картка AI-обраного оголошення (rank/reason)
        │   │   ├── relevance/               # workflow «Семантична класифікація (AI Фільтр)»
│   │   │   ├── RelevanceFilterDialog.tsx # оболонка діалогу (DialogRoot)
│   │   │   ├── RelevanceSetupForm.tsx    # форма запуску (авто + ручний ZIP)
│   │   │   └── RelevanceResultsList.tsx  # список результатів з ручним коригуванням
        │   │   ├── ai-picks/               # workflow «AI Вибір» (план docs/plans/AI-auto-top.md)
        │   │   │   ├── AiPicksDialog.tsx    # оболонка діалогу (DialogRoot + trigger)
        │   │   │   ├── AiPicksIdleStep.tsx  # UI кроку idle (кнопка запуску, ManualAssistant)
        │   │   │   └── AiPicksResultStep.tsx # UI кроку done (картки AiRankCard, збереження)
        │   │   └── wizard/                 # workflow «AI-аналіз» (4-етапний майстер мінуси/плюси)
        │   │       ├── AnalysisWizardDialog.tsx # оболонка діалогу (DialogRoot + степер + switch по кроках)
        │   │       ├── WizardStepper.tsx    # UI степеру (4 кроки: критерії→пошук→перевірка→вставка)
        │   │       ├── CriteriaStep.tsx     # крок 1: вибір режиму/scope, критеріїв, генерація
        │   │       ├── MatchingStep.tsx     # крок 2: авто-аналіз або ZIP + ручний імпорт
        │   │       ├── ReviewStep.tsx       # крок 3: перевірка (таблиця desktop / картки mobile)
        │   │       └── CommitStep.tsx       # крок 4: merge mode + запис у БД
        │   ├── settings/         # папка компонентів налаштувань
        │   │   ├── index.ts           # барель: export { SettingsDrawer }
        │   │   ├── SettingsDrawer.tsx # Drawer "Налаштування", об'єднує секції з sections/
        │   │   └── sections/
        │   │       ├── VisualSection.tsx      # секція "Візуальний вигляд" (тема, розширений опис)
        │   │       ├── AutoRefreshSection.tsx # секція "Автооновлення" (перемикач, інтервал)
        │   │       ├── AnalysisSection.tsx    # секція "AI-аналіз" (статус ключа, модель, reasoning, додаткові критерії)
        │   │       └── ColumnsSection.tsx     # секція "Колонки таблиці" (перевпорядкування drag-and-drop, видимість колонок)
        │   ├── DescriptionDialog.tsx # модалка повного опису оголошення (фото/ціна/опис/посилання)
        │   ├── ConfirmActionDialog.tsx # узагальнена alertdialog-модалка підтвердження (видалення тощо)
        │   ├── table/             # компоненти таблиці оголошень
        │   │   ├── index.ts       # барель-експорт основних частин таблиці (Header, Body, Pagination, FilterBar)
        │   │   ├── HeaderLabel.tsx # заголовок колонки з іконкою
        │   │   ├── columns.tsx     # опис колонок (TanStack Table), колонка select, TOGGLEABLE_COLUMNS
        │   │   ├── ListingsTableHeader.tsx # заголовок таблиці з ресайзером (onEnd)
        │   │   ├── ListingsTableBody.tsx # тіло таблиці (відображення рядків)
        │   │   ├── ListingsTableRow.tsx # рядок таблиці (React.memo), приглушений стиль для disabled/rejected
        │   │   ├── StatusCell.tsx # інлайн-едіт статусу (NativeSelect) + status_source
        │   │   ├── ActivityCell.tsx # інлайн-едіт «Активності» (olx_status, NativeSelect) — разова підказка без захисту (docs/plans/honest-olx-status.md)
        │   │   ├── NoteCell.tsx   # інлайн-едіт нотатки (Popover + textarea)
        │   │   ├── PhotoCell.tsx  # мініатюра фото + Tooltip-галерея (збільшення при наведенні, photo_urls)
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
        │   ├── settingsStore.ts       # useSettingsStore: глобальне сховище UI-налаштувань та опцій AI (Zustand + persist)
        │   ├── listingsUiStore.ts     # useListingsUiStore: statusFilter (вкладка таблиці), showFilteredOut, showIrrelevant — спільний стан між таблицею і AI-майстром
        │   └── analysisWizardStore.ts # useAnalysisWizardStore: прогрес AI-Flow (mode/scope/step/критерії/результати); bindSearch/reset
        ├── hooks/
        │   ├── useListingsTableState.ts # збереження/завантаження стану таблиці (сортування, sizing)
        │   ├── useAutoRefresh.ts # періодичний автоскан усіх пошуків (інтервал з налаштувань, пауза 5-10с між пошуками)
        │   ├── useSearchActionPanel.ts # стан панелі дій пошуку: швидкий/глибокий скан, verify, двофазний deep-скан (аналіз → звіт → запуск)
        │   ├── useIsMobile.ts    # useBreakpointValue < md (768px) — для responsive JS-розгалужень
        │   ├── useListingsMap.ts  # мемоїзована Map<id, Listing> з масиву listings (спільний для AI-діалогів)
        │   ├── useZipDownload.ts  # хук для паттерну «завантажити ZIP» (downloading/downloaded/download)
        │   ├── useAiPicksFlow.ts  # бізнес-логіка AI Вибір (стан step/picks, handleRun/Import/Commit)
        │   ├── analysis/          # AI-аналіз логіка (кроки майстра)
        │   │   ├── useWizard.ts        # тонкий оркестратор логіки AI-аналізу (об'єднує useAnalysis*)
        │   │   ├── useAnalysisScope.ts # обчислення множин ID для аналізу (allIds, tabIds, effectiveIds)
        │   │   ├── useAnalysisCriteria.ts # логіка кроку 1 (генерація/імпорт/вибір критеріїв)
        │   │   ├── useAnalysisMatching.ts # логіка кроку 2 (авто-аналіз, завантаження ZIP, імпорт)
        │   │   ├── useAnalysisReview.ts # логіка кроку 3 (перевірка збігів, overrides, експорт)
        │   │   └── useAnalysisCommit.ts # логіка кроку 4 (режими запису, запис у БД)
        │   ├── useRelevanceFlow.ts # логіка семантичної класифікації (AI Фільтр)
        │   ├── useNewSearchForm.ts # стан і сабміт форми створення нового пошуку (NewSearchForm)
        │   ├── useLocalFiltersForm.ts # стан форми локальних фільтрів (SearchFiltersDrawer)
        │   └── useSearchRowActions.ts # мутації рядка пошуку: архівування/видалення/пересортування (SearchRow)
        ├── pages/
        │   └── ListingsTable.tsx # таблиця оголошень + ListingsFilterBar + BulkActionBar + DescriptionDialog
        ├── types/
        │   └── index.ts          # спільні типи фронтенду (Listing, ListingStatus, Search, StoredTableState тощо)
        └── utils/
            ├── format.ts         # хелпери форматування (ціна, дата/відносний час, чистка HTML-опису)
            ├── status.ts         # STATUS_LABELS, STATUS_COLORS (re-export із theme/palette), isMutedStatus()
            ├── listingVisibility.ts # єдиний предикат видимості рядка (passesNoiseFilters/isAiPickCandidate/isListingVisible) — спільний для таблиці, лічильників вкладок і обсягу AI-аналізу
            ├── storage.ts        # збереження/завантаження стану сортування та розмірів колонок таблиці у localStorage
            ├── text.ts           # escapeRegExp() — спільне для HighlightText та підсвітки evidence
            ├── array.ts          # chunk() — клієнтське чанкування запитів/записів
            ├── download.ts       # downloadBlob()/downloadText() — завантаження файлів (експорт, ручний пакет)
            ├── clipboard.ts      # copyToClipboard() — копіювання + toast «Скопійовано»
            ├── sort.ts           # sortAlpha() — алфавітне сортування (укр. колація, латиниця в кінці) для синонімів і критеріїв AI
            ├── search.ts         # локальний пошук зі спецсимволами && / || / ! (matchesQuery/toHighlightQuery)
            ├── localFilters.ts   # parseLocalFilters()/hasActiveLocalFilters() — парсинг searches.local_filters (SearchFiltersDrawer, SearchRow)
            ├── searchSynonyms.ts # parseSearchSynonyms() — парсинг searches.query_synonyms (SearchRow, SearchEditDialog)
            ├── relevance.ts      # чисті функції для AI-фільтра (getEffectiveRelevanceIds, getRelevanceStats)
            └── analysis.ts       # чисті функції для AI-аналізу (isIncludedFn, computeDefaultScope, buildScopeLabel)
```

## Орієнтири «куди дивитись»

| Завдання | Файли |
| --- | --- |
| GraphQL-запит до OLX (основний збір) | `server/src/scraper/graphql/` (fetcher/constants/types) + `docs/olx-api.md` §2 |
| Змінити OLX-селектори/заголовки (HTML fallback) | `server/src/scraper/selectors.ts` |
| Логіка побудови URL / парсингу HTML-списку | `server/src/scraper/olxFetcher.ts` |
| Нормалізація/дедуплікація | `server/src/scraper/normalizer.ts` |
| Порядок стратегій збору / fallback | `server/src/scanner.ts` |
| Схема БД | `server/src/db/schema.sql` (+ `db.ts` для застосування) |
| Нові API-ендпойнти | `server/src/routes/*.ts`, реєстрація в `server/src/index.ts` |
| Доменні типи | `server/src/types.ts` (бек), `web/src/types/index.ts` (фронт) |
| Запити з фронту | `web/src/api/*` |
| UI-сторінки | `web/src/pages/*.tsx`, `web/src/App.tsx` |
| Налаштування вигляду (тема, видимість колонок) | `web/src/components/settings/SettingsDrawer.tsx` (із секціями в `settings/sections/`), `web/src/App.tsx` (стан), `web/src/utils/storage.ts` (localStorage), `TOGGLEABLE_COLUMNS` у `web/src/components/table/columns.tsx` |
| Статуси оголошень (вікно покриття, `miss_count`, `olx_status`-disable, ручний override) | `server/src/scraper/statusEngine.ts`, `server/src/scraper/normalizer.ts`, `docs/olx-monitor-spec.md` §6 |
| Локальні фільтри (`price_range`, `cities`, `sellers`, `filtered_out`) | `server/src/scraper/localFilters.ts`, `web/src/components/searches/SearchFiltersDrawer.tsx`, `web/src/utils/localFilters.ts`, `GET /api/searches/:id/filter-options` |
| Інлайн-едіт статусу/нотатки/плюсів, масові дії, фільтри таблиці | `web/src/components/table/StatusCell.tsx`, `NoteCell.tsx`, `ProsConsCell.tsx`, `BulkActionBar.tsx`, `ListingsFilterBar.tsx` |
| Глибокий скан / прогрес сканування | `server/src/scanner.ts`, `web/src/components/searches/SearchActionPanel.tsx`, `GET /api/searches/:id/scan-status` |
| Двофазний deep-скан (аналіз → звіт → підтверджений запуск, перевикористання плану) | `server/src/scraper/graphql/fetcher.ts` (`analyzeSplit`/`scanFromPlan`), `server/src/scanner.ts` (`analyzeScan`/`runDeepScanFromPlan`), `POST /api/searches/:id/scan/analyze`/`/scan/run-plan`, `web/src/hooks/useSearchActionPanel.ts`, `web/src/components/searches/action-panel/ScanPlanReportDialog.tsx` + `docs/plans/two-phase-deep-scan.md` |
| Зупинка скану + прозорість дедупу + історія аналізу | `server/src/scanner.ts` (`requestStopScan`/`isPlanCached`, `raw_found`/`scan_plan`), `server/src/scraper/graphql/fetcher.ts` + `olxFetcher.ts` (`FetchOptions.shouldAbort`), `POST /api/searches/:id/scan/stop`, `GET /api/searches/:id/last-analysis`, `web/src/hooks/useSearchActionPanel.ts`, `web/src/components/searches/action-panel/{ScanProgressPanel,ScanPlanReportDialog,ActionPanelLastScan}.tsx` + `docs/plans/deep-scan-stop-and-history.md` |
| Попередження vs помилка скану + людино-зрозуміле зведення warning | `scan_runs.warning` (окремо від `error`) — `server/src/scanner.ts`, `server/src/db/{schema.sql,db.ts}`; UI: `web/src/utils/scanWarning.ts` (парсер), `web/src/components/searches/action-panel/{ScanWarningSummary,ActionPanelLastScan}.tsx` |
| Verify-прохід (детект неактивних, дозаповнення опису/продавця) | `server/src/scraper/verifier.ts`, `server/src/scanner.ts` (`runVerify`), `POST /api/searches/:id/verify`, `web/src/components/searches/SearchActionPanel.tsx` |
| Нормалізація дат HTML-fallback (`posted_at`), вікно пагінації GraphQL | `server/src/scraper/dateParser.ts`, `server/src/scraper/graphql/fetcher.ts`, `server/src/migratePostedAt.ts` |
| Автооновлення (фон) | `web/src/hooks/useAutoRefresh.ts`, `web/src/components/SettingsDrawer.tsx` (секція `AutoRefreshSection`), `web/src/utils/storage.ts` |
| LLM-аналіз (мінуси/плюси, OpenRouter + ручний режим) | `server/src/analysis/*`, `server/src/routes/analysis/*`, `server/src/export/xlsx.ts`, `web/src/components/analysis/*`, `web/src/components/settings/sections/AnalysisSection.tsx` + `docs/plans/llm-analysis.md` |
| Синоніми пошукового запиту (мульти-query скан, генерація, alias у AI-фільтрі) | `server/src/scanner.ts` (`fetchAllQueries`), `server/src/routes/searchSynonyms.ts`, `server/src/analysis/relevance.ts`/`repo.ts` (`getRelevanceAliases`), `web/src/components/searches/SearchVariantsDialog.tsx` + `docs/plans/search-synonyms.md` |
| Чесний статус активності (`olx_status`): поріг disable deep=1/normal=2, перезапис death-детекторами, бейдж+свіжість, ручний інлайн-override | `server/src/scraper/statusEngine.ts` (`threshold`, `olx_status='inactive'`), `server/src/scanner.ts` (виклик `deep?1:2`, verify `olx_status='removed'/'active'`), `server/src/routes/listings.ts` (PATCH `olx_status`), `web/src/components/table/ActivityCell.tsx` + `columns.tsx` (колонка «Активність») + `docs/plans/honest-olx-status.md` |
| Скрипти/воркспейси | кореневий `package.json` |
