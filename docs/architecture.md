# Архітектура — OLX Dashboard

> Технічний огляд реалізації. Канон вимог і рішень — у [`olx-monitor-spec.md`](./olx-monitor-spec.md).
> Деталі запитів до OLX (URL, параметри, заголовки, селектори) — у [`olx-api.md`](./olx-api.md).
> Дерево файлів і призначення кожного модуля — у [`structure.md`](./structure.md).
> Інваріанти й конвенції, обовʼязкові при змінах, — у [`../CLAUDE.md`](../CLAUDE.md).

## 1. Огляд

Персональна single-user система моніторингу оголошень OLX.ua: збір через GraphQL API OLX
(fallback — HTML) → SQLite → React-таблиця. Локальний запуск, без зовнішніх сервісів
(Notion/cron — пізніші етапи).

Поточний стан: **реалізовано Етап 1 (MVP)**, включно з міграцією збору на GraphQL
(основний метод; HTML — fallback, [`plans/graphql-migration.md`](./plans/graphql-migration.md))
і міграцією фронтенду на Chakra UI v3. Етапи 2–4 — у
[`olx-monitor-spec.md` §12](./olx-monitor-spec.md).

## 2. Стек

| Шар | Технологія |
| --- | --- |
| Monorepo | npm workspaces (`server/` + `web/`) |
| Backend | Node.js 20+, TypeScript (strict), Fastify 5, better-sqlite3 (синхронний), cheerio |
| Frontend | React 18, Vite 6, TanStack Query v5, TanStack Table v8, Chakra UI v3 (+ next-themes) |
| Збір даних | GraphQL `POST /apigateway/graphql` (основний); `fetch` + cheerio HTML-парсинг (fallback). БЕЗ браузера/Playwright |

## 3. Архітектура та потік даних

```mermaid
flowchart LR
    subgraph web [web/ — React SPA :5173]
        UI[Searches + ListingsTable]
        QC[TanStack Query<br/>api/client.ts]
        UI --> QC
    end

    subgraph server [server/ — Fastify :3001]
        R1[routes/searches.ts<br/>CRUD + /scan]
        R2[routes/listings.ts<br/>GET listings]
        SC[scanner.ts<br/>runScan]
        GQ[scraper/graphqlOlxFetcher.ts<br/>GraphqlOlxFetcher — основний]
        FE[scraper/olxFetcher.ts<br/>HtmlOlxFetcher — fallback]
        NR[scraper/normalizer.ts<br/>parse + upsert]
        DB[(db/db.ts<br/>better-sqlite3)]
        R1 --> SC
        SC --> GQ
        SC -. "якщо GraphQL упав" .-> FE
        SC --> NR
        NR --> DB
        R1 --> DB
        R2 --> DB
    end

    QC -- "/api (Vite proxy)" --> R1
    QC -- "/api (Vite proxy)" --> R2
    GQ -- "POST /apigateway/graphql" --> OLX[(www.olx.ua)]
    FE -- "GET HTML сторінки пошуку" --> OLX
```

**Сценарій сканування** (`POST /api/searches/:id/scan` або CLI `npm run scan`):

1. `scanner.runScan(searchId, options?: { deep?: boolean })` читає рядок `searches`,
   парсить `api_filters` (JSON) у `SearchConfig`.
2. Створює запис у `scan_runs` (`started_at`, `kind` = `'deep'` якщо `options.deep`, інакше
   `'normal'`).
3. `GraphqlOlxFetcher.fetchSearch(search, options?)` шле ≤3 POST-запити (offset 0/40/80,
   затримка 1–2 с, заголовки з [`olx-api.md` §2.3](./olx-api.md)) → структуровані
   `RawListing[]` (ціна числом, ISO-дати, `params`) + `exhausted` (остання сторінка `< 40`).
   Якщо GraphQL упав — scanner автоматично повторює скан через `HtmlOlxFetcher`
   (cheerio-парсинг сторінки пошуку, `exhausted` завжди `false`) і фіксує позначку fallback
   у `scan_runs.error`. При `options.deep` — батчі по 3 запити з паузою 3–6 с,
   ціль `min(26, ceil(visible_total_count/40))` (26 = межа вікна пагінації GraphQL OLX,
   `offset ≤ 1000`; деталі — `olx-api.md` §2.9). Якщо GraphQL вперся у це вікно посеред
   скану (`ListingError` на `offset > 0` з уже зібраними оголошеннями) — скан завершується
   **частковим успіхом** (`exhausted=false`, `warning` записується у `scan_runs.error`),
   HTML-fallback не запускається. Після кожного запиту/сторінки викликається
   `options.onProgress(done, total)`, який scanner записує у
   `scan_runs.requests_done`/`requests_total`.
4. `normalizer.upsertListings()` використовує структуровані поля (GraphQL) або парсить сирі
   рядки (HTML), робить upsert по `olx_id` у транзакції, рахує `new_count`, оновлює
   `filtered_out` (`localFilters.evaluateFilteredOut`) і — для GraphQL-даних — застосовує
   миттєвий `olx_status`-disable/reactivate.
5. Якщо фетчер був GraphQL (не fallback), скан успішний і **повний** (без warning часткового
   результату — напр. «window cap hit») — `statusEngine.applyScanStatuses(searchId,
   fetched, exhausted)` застосовує вікно покриття (`miss_count`/disable, §6.1
   [`olx-monitor-spec.md`](./olx-monitor-spec.md)) і повертає `disabled_count`. Вісь вікна —
   `last_refresh_at` (дата підняття; запити збору передають `sort_by=created_at:desc`,
   фактичний порядок видачі — `last_refresh_time DESC` — `olx-api.md` §2.5,
   `docs/plans/coverage-window-fix.md`).
6. `scan_runs` оновлюється (`finished_at`, `found`, `new_count`, `disabled_count`); падіння
   обох стратегій → `scan_runs.error`, виняток прокидається в роут (HTTP 500), **процес не
   падає**.
7. Web інвалідовує кеш `listings`/`search-stats` і перемальовує таблицю/панель дій.

> **Verify-сценарій (реалізовано, A3):** `runVerify(searchId)` — окремий `kind='verify'`
> прохід без фетчера видачі. Кандидати (≤`VERIFY_PAGE_CAP=50`): P1 — `last_seen_at` старше
> 3 днів і (`status_source='auto'` АБО `status='rejected'`), включно з `disabled` для
> реактивації, `ORDER BY last_seen_at ASC`; P2 — рядки без `description`, ще не в P1,
> `ORDER BY posted_at DESC`. Для кожного — `probeListingPage(url)` (батч-патерн deep scan:
> 3 запити, пауза 1–2с усередині, 3–6с між батчами). `dead` (`410`/`404`) →
> `status='disabled'` + позначка `auto-disabled: verify http=<код>` у `note` (лише
> auto/rejected); `alive` → `last_seen_at`/`miss_count=0`, auto-reactivate `disabled→new`
> (якщо `status_source='auto'`), backfill `description`/`seller_name` лише якщо `NULL`;
> `unknown` → без змін. Прогрес і підсумок — той самий механізм `scan_runs`
> (`requests_done/requests_total`, `found=checked`, `new_count=reactivated`,
> `disabled_count`). Деталі — `docs/plans/verify-pass.md`, маркер — `olx-api.md` §3.4.

## 4. Модулі бекенду

| Модуль | Відповідальність |
| --- | --- |
| `db/db.ts` | Відкриває `server/data/olx.db`, вмикає WAL + foreign_keys, застосовує `schema.sql` при старті, далі `addColumnIfMissing` для дрібних додавань колонок і `migrateListingsTable()` (rebuild `listings` під `PRAGMA user_version=2`: новий CHECK статусів + `miss_count`). Бекфіл `searches.sort_order`. Експортує singleton `db`. |
| `db/schema.sql` | Канонічна схема (4 таблиці). Єдине джерело визначень — не дублювати в коді. |
| `types.ts` | Доменні типи (`SearchConfig`, `RawListing`, `ScanResult`, `ListingRow`, `ListingStatus`/`LISTING_STATUSES`, `ListingPatch`, `LocalFilters`, `ParamKeyInfo`, `LastScanInfo`, `SearchStats`, `FetchOptions`, `ScanStatus`, інтерфейс `OlxFetcher`). Без `any`. |
| `scraper/graphqlOlxFetcher.ts` | `GraphqlOlxFetcher implements OlxFetcher` (основний). `fetchPage(search, offset, referer, opts?)` — один POST → `{ items, visibleTotalCount, listingError }` (спільна цеглина). `fetchSearch` — звичайний/глибокий прохід одного діапазону (батчі по 3 з паузами 3–6с, ціль за `visible_total_count`, обмежена `MAX_PAGES=26` — вікно `offset≤1000`); `ListingError` на `offset>0` з даними → частковий успіх (`warning`). `fetchSearchSplit` — глибокий скан із авто-розбиттям по ціні: якщо `visible_total_count > SPLIT_THRESHOLD(1000)`, адаптивна бісекція діапазону на бакети ≤ вікна, скан кожного, злиття дедупом `olxId`; інакше делегує `fetchSearch`. `probeMaxPrice` — зондування верхньої межі ціною спадно (самоперевірка впорядкованості; сортування за ціною не верифіковане live → `null`-fallback). Запобіжники `MAX_BUCKETS=40`/`MAX_TOTAL_REQUESTS=200`; повертає `bucketsUsed`. Деталі — `olx-api.md` §2.9. |
| `scraper/selectors.ts` | Усі OLX-селектори + заголовки HTML-запиту в одному місці (для fallback). |
| `scraper/olxFetcher.ts` | `HtmlOlxFetcher implements OlxFetcher` (fallback №1): побудова URL, fetch, cheerio-парсинг, guard на JS-only сторінку. Той самий `FetchOptions`/глибокий режим (без уточнення цілі за `visible_total_count` — одразу `DEEP_SAFETY_CAP`); `exhausted` завжди `false`. |
| `scraper/dateParser.ts` | `parseOlxDate(raw, now?) → string \| null` — текстові дати HTML-fallback («Сьогодні/Вчора о HH:MM», «D <місяць_родовий> YYYY р.») → ISO (`YYYY-MM-DD[THH:MM:00]`), сумісний з ISO-датами GraphQL для коректного порівняння у `statusEngine.ts`. Нерозпізнане → `null`. |
| `scraper/normalizer.ts` | `upsertListings` (upsert по `olx_id`): пріоритет структурованим полям (GraphQL); для HTML — `parsePrice`, розбір локації/дати + `dateParser.parseOlxDate` для `posted_at` (завжди ISO або `NULL`, ніколи сирий текст). На insert/update — миттєвий `status='disabled'` за `olx_status ≠ 'active'` (для `auto`/`rejected`, з позначкою в `note`) і auto-reactivate; рахує `filtered_out` через `localFilters.evaluateFilteredOut`. |
| `scraper/statusEngine.ts` | `applyScanStatuses(searchId, fetched, exhausted) → {disabled_count}` (Етап 2, A2) — вікно покриття на осі `last_refresh_at`: `windowFloor = lastRefreshAt` останнього отриманого (`null`, якщо `exhausted`; немає осі → прохід пропускається), відсутні у видачі кандидати в межах вікна дістають `miss_count += 1`, при `>= 2` (auto/rejected) → `disabled` + маркер `auto-disabled: coverage miss_count=2` у `note`. Викликається з `scanner.ts` лише для повних успішних GraphQL-сканів (часткові з warning — ні). |
| `scraper/localFilters.ts` | `evaluateFilteredOut(filters, listing) → boolean` (Етап 2, A4) — стоп-слова (case-insensitive підрядок у title+description) і числові діапазони по `params[key]` (перше число в label). Чиста функція, використовується `normalizer.ts` і `routes/searches.ts` (ретроактивний перерахунок). |
| `scraper/verifier.ts` | `probeListingPage(url)` (Етап 2, A3) — пряма проба сторінки оголошення: `fetch` з `redirect:'manual'`; `404`/`410` → `dead`; `200` + `[data-testid="ad_description"]` → `alive` (опис/продавець для backfill); інше → `unknown`. Маркер верифіковано live 2026-06-12 (`olx-api.md` §3.4). |
| `scanner.ts` | `runScan(searchId, options?: { deep?: boolean })` — спільна логіка для HTTP-роута і CLI; GraphQL → HTML fallback (deep-гілка GraphQL → `fetchSearchSplit`, звичайна → `fetchSearch`); пише `scan_runs.kind` (`normal`/`deep`); після upsert викликає `statusEngine.applyScanStatuses` лише для повних GraphQL-сканів без warning (split-скан ставить warning → `partial` → coverage пропускається); веде `scan_runs` (включно з `requests_done`/`requests_total` через `onProgress`, `disabled_count`); повертає `bucketsUsed`. Також `runVerify(searchId)` (Етап 2, A3) — кандидати P1+P2 (`loadVerifyCandidates`/`countVerifyCandidates`), батчі по `VERIFY_BATCH_SIZE=3` з паузами 1–2с/3–6с, оновлення статусів/backfill за вердиктом `probeListingPage`, `scan_runs.kind='verify'`. |
| `routes/searches.ts` | CRUD `/api/searches[/:id]` (PATCH з `local_filters` → ретроактивний перерахунок `filtered_out`) + `POST /:id/move` + `POST /:id/scan` (`?deep=true`) + `GET /:id/scan-status` + `GET /:id/param-keys` + `GET /:id/stats`. |
| `routes/listings.ts` | `GET /api/searches/:id/listings` з білим списком колонок для сортування + `PATCH /api/listings/:id` (`{status?, note?}`, валідація `LISTING_STATUSES`, зміна статусу → `status_source='manual'`, `miss_count=0`). |
| `analysis/*` | **LLM-аналіз** (план `plans/llm-analysis.md`, доповнено `plans/analysis-wizard-review-rework.md`): `constants.ts` (ЄДИНЕ джерело magic-значень: модель, `AUTO_CHUNK_SIZE=12`, `MANUAL_ZIP_CHUNK_SIZE=50`, `MAX_ANALYZE_IDS=200`, мапи режиму, scaffold, повідомлення про помилки, `MIME_ZIP`), `config.ts` (лише завантаження `server/.env` через `process.loadEnvFile` + `hasApiKey`/`getApiKey`), `prompts.ts` (єдине джерело промптів `buildCriteriaPrompt`/`buildMatchingPrompt`/`pickSample`/`buildManualZipInstructions`/`buildChunkListings`/`PATTERNS_EXAMPLE_JSON` для авто Й ручного), `analyze.py` (готовий детермінований Python-движок для ZIP-пакета: regex-матчинг критеріїв з клауза-скоуп запереченнями, морфологічними стемами, дослівним evidence; читається з диску як `schema.sql` і кладеться в ZIP), `openrouter.ts` (`chat()` — POST `/chat/completions`, `response_format:json_object`, ретрай, зняття code-fence), `parse.ts` (парс відповідей критеріїв/matching + верифікація `evidence` як підрядок опису + мерж кількох вставок), `text.ts` (`stripHtml`/`normalizeForMatch`/`evidenceConfirmed`). PII продавця в промпт не йде; `evidence` у БД не зберігається. |
| `export/xlsx.ts` | `buildXlsxBuffer(sheet, columns, rows)` на **ExcelJS** — спільний Excel-експорт (превʼю аналізу + майбутній експорт усієї таблиці): заголовки/ширини, заморожений рядок заголовків, перенос тексту. |
| `routes/analysis.ts` | Ендпойнти LLM-аналізу (нижче §6). Критерії читаються/пишуться у `searches.analysis_criteria`; commit пише `pros`/`cons` + `analysis_at/source/model`, `analysis_stale=0`. |
| `index.ts` | Fastify bootstrap, CORS для `:5173`, `/health`, реєстрація `searchesRoutes`/`listingsRoutes`/`analysisRoutes`, слухає `:3001`. |
| `scan.ts` | CLI-обгортка над `runScan` (`npm run scan -- --search <id>`). |
| `migratePostedAt.ts` | Одноразова CLI-міграція (`npm run migrate:posted-at`): конвертує наявні текстові `posted_at` (старий HTML-fallback) через `dateParser.parseOlxDate` в ISO; нерозпізнане → `NULL`. Виводить кількість конвертованих/занулених. |

## 5. Схема БД

Канон — [`server/src/db/schema.sql`](../server/src/db/schema.sql) (детальний опис полів у
[`olx-monitor-spec.md` §5](./olx-monitor-spec.md)). Таблиці: `searches`, `listings`,
`price_history`, `scan_runs`.

Ключові інваріанти (повний перелік — у [`../CLAUDE.md`](../CLAUDE.md)):
- `listings.olx_id` UNIQUE — ключ дедуплікації (upsert).
- `status` ∈ `new|interested|contacted|rejected|disabled`; `status_source` ∈ `auto|manual`;
  `miss_count` — лічильник сканів поспіль без оголошення у вікні покриття.
- `params` зберігається сирим JSON.
- `filtered_out` — прапорець локальних фільтрів (`local_filters`), рядок не видаляється.
- `searches.sort_order` — ручний порядок у списку (менше → вище); бекфіл існуючих рядків
  (`0..N-1` за `created_at DESC`) виконує `db.ts` при старті, нові пошуки отримують
  `MIN(sort_order) - 1` (з'являються згори).

> `price_history` створена у схемі, але кодом ще не наповнюється (Етап 3).

- LLM-аналіз (план `plans/llm-analysis.md`): `searches.analysis_criteria` (JSON `{cons:[],
  pros:[]}` — обрані критерії пошуку); `listings.pros`/`cons` (масив criterion, TEXT
  `• …\n• …`), `analysis_at`/`analysis_source` (`api`|`import`)/`analysis_model`/
  `analysis_stale`. Нові колонки додаються через `addColumnIfMissing` **після**
  `migrateListingsTable()` (rebuild не переносить їх → інакше крах на старій v1-БД).
  `evidence` у БД не зберігається. `normalizer` ставить `analysis_stale=1`, якщо
  `analysis_at` непорожній і title/опис змінились (бейдж «застарілий аналіз»).

## 6. REST API

| Метод | Шлях | Стан |
| --- | --- | --- |
| `GET/POST/PATCH/DELETE` | `/api/searches[/:id]` | ✅ Етап 1/2 — `GET` сортує за `sort_order ASC, created_at DESC, id DESC`; `DELETE` каскадний (`price_history` → `scan_runs` → `listings` → `searches`, у транзакції); `PATCH` з `local_filters` (Етап 2) → зберігає + синхронно перераховує `filtered_out` для всіх рядків пошуку, повертає `filtered_out_count` |
| `POST` | `/api/searches/:id/move` | ✅ — `{direction: 'up'\|'down'}`, міняє `sort_order` із сусідом за поточним порядком (для кнопок ↑/↓ у sidebar) |
| `POST` | `/api/searches/:id/scan?deep=true` | ✅ Етап 1/2 — повертає `{found, new_count, requestsUsed, disabled_count}`; `deep=true` — глибокий скан (§2.9 `olx-api.md`); `disabled_count` — результат `statusEngine` (Етап 2, лише GraphQL-скани) |
| `POST` | `/api/searches/:id/verify` | ✅ Етап 2 (A3) — verify-прохід (кандидати P1+P2, ≤50 сторінок); повертає `VerifyResult {checked, alive, dead, unknown, reactivated, disabled_count, backfilled}` |
| `GET` | `/api/searches/:id/scan-status` | ✅ Етап 1/2 — останній рядок `scan_runs` (для поллінгу прогресу глибокого скану/verify) |
| `GET` | `/api/searches/:id/listings?sort=&order=` | ✅ Етап 1 |
| `GET` | `/api/searches/:id/param-keys` | ✅ Етап 2 — `{key, samples}[]` для конструктора діапазонів локальних фільтрів |
| `GET` | `/api/searches/:id/stats` | ✅ Етап 2 — `{in_db, stale_count, verify_candidates, last_scan}` для панелі дій пошуку (`verify_candidates` = P1+P2, лічильник кнопки «Перевірити неактивні») |
| `PATCH` | `/api/listings/:id` | ✅ Етап 2 — `{status?, note?, pros?, cons?}`; зміна `status` → `status_source='manual'`, `miss_count=0` |
| `GET` | `/api/analysis/status` | ✅ LLM-аналіз — `{apiAvailable, defaultModel}` (наявність `OPENROUTER_API_KEY`) |
| `GET/PUT` | `/api/searches/:id/criteria` | ✅ — читання/збереження `searches.analysis_criteria` (`{cons[], pros[]}`) |
| `POST` | `/api/searches/:id/criteria/generate` | ✅ — авто-генерація критеріїв (OpenRouter), без ключа → 409 |
| `GET` | `/api/searches/:id/criteria/prompt?mode=` | ✅ — готовий промпт генерації (ручний режим) |
| `POST` | `/api/searches/:id/criteria/import` | ✅ — парс вставленої відповіді LLM у список критеріїв |
| `POST` | `/api/searches/:id/analyze` | ✅ — авто matching (чанки по 12), верифікація `evidence`; `{results, errors}`, НЕ пише в БД |
| `GET` | `/api/searches/:id/analyze/package.zip?mode=&ids=` | ✅ — ZIP-пакет ручного режиму: `prompt.txt` (інструкція з 2 варіантами) + `analyze.py` (готовий детермінований движок) + `patterns.example.json` (приклад мапи) + `descriptions/chunk-NNN.json` (по 50 оголошень) |
| `POST` | `/api/searches/:id/analyze/import` | ✅ — парс однієї вставленої відповіді + верифікація + мерж у накопичене |
| `POST` | `/api/searches/:id/analyze/export` | ✅ — експорт превʼю (`xlsx` через ExcelJS \| `json`) |
| `POST` | `/api/listings/analyze/commit` | ✅ — запис `pros`/`cons` + `analysis_*` (chunked з боку клієнта); `merge='append'` (дефолт UI — додати до наявних без дублів) \| `'replace'` (перезаписати) |
| `GET` | `/health` | ✅ |
| `GET` | `/api/listings/:id/price-history` | ⏳ Етап 3 |
| `GET` | `/api/listings/:id/export/markdown` | ⏳ Етап 3 |
| `POST` | `/api/searches/:id/export/notion` | ⏳ Етап 4 |

## 7. Frontend

- `api/client.ts` — fetch-обгортка + TanStack Query хуки: `useSearches`, `useCreateSearch`,
  `useDeleteSearch`, `useReorderSearches`, `useScan`, `useVerify`, `useScanStatus`,
  `useSearchStats`, `useListings`, `useUpdateListing`, `useParamKeys`, `useUpdateSearchFilters`.
  LLM-аналіз: `useAnalysisStatus`, `useSavedCriteria`, `useGenerateCriteria`,
  `useImportCriteria`, `useSaveCriteria`, `useAnalyze` (клієнтське чанкування по 200),
  `useImportAnalysis`, `useCommitAnalysis` (chunked) + плоскі хелпери `fetchCriteriaPrompt`/
  `fetchAnalyzePackageZip`/`exportPreview` (GET/blob за кнопкою). Всі типи DTO імпортуються з `types/index.ts`. Форма пошуку маппить «ціна від/до» у
  `api_filters.ranges.price`. `useScan` приймає `{searchId, deep?}` і має
  `mutationKey: ['scan']` (щоб `useAutoRefresh` міг перевірити `queryClient.isMutating`),
  інвалідовує `['listings', searchId]` і `['search-stats', searchId]`; `useVerify` (Етап 2,
  A3) — `POST /api/searches/:id/verify` (`mutationKey: ['verify']`), та сама інвалідація;
  `useScanStatus(searchId, enabled)` поллить `GET .../scan-status` раз на ~1.5с, поки
  `enabled`; `useSearchStats(searchId)` тягне `GET /api/searches/:id/stats` для панелі дій. `useUpdateListing()` —
  `PATCH /api/listings/:id` (`{status?, note?}`) з оптимістичним апдейтом кешу
  `['listings', searchId]`. `useParamKeys(searchId, enabled)` — `GET .../param-keys` (для
  конструктора діапазонів, увімкнено лише коли відкрито `SearchFiltersDrawer`).
  `useUpdateSearchFilters()` — `PATCH /api/searches/:id` з `local_filters`, інвалідовує
  `['searches']` і `['listings', searchId]`, повертає `filtered_out_count`. `useDeleteSearch`
  інвалідовує `['searches']` і прибирає кеш `['listings', id]`; `useReorderSearches` шле
  `POST /api/searches/:id/move` і інвалідовує `['searches']`.
- `types/index.ts` — централізований файл з усіма фронтенд-типами: `Listing` (включно з
  `status`, `status_source`, `note`, `filtered_out`, `miss_count`, `olx_status`),
  `ListingStatus`/`LISTING_STATUSES`, `ListingPatch`, `LocalFilters`, `ParamKeyInfo`,
  `LastScanInfo`, `SearchStats`, `Search` (включно з `sort_order`, `visible_total_count`,
  `local_filters`), `NewSearchInput`, `StoredTableState` тощо — дзеркало відповідних типів
  `server/src/types.ts`.
- `utils/storage.ts` — хелпери для взаємодії з `localStorage`: загальні `loadSettings`/`saveSettings`
  над одним обʼєктом `SETTINGS_STORAGE_KEY` (поля `columnVisibility`, `descriptionExpandEnabled`
  (дефолт `true`), `autoRefreshEnabled`/`autoRefreshIntervalMin` (дефолт `false`/`30`),
  `skipDeepScanConfirm`) + окремо стан таблиці `TABLE_STORAGE_KEY` (сортування/розміри
  колонок/`pageSize`, дефолт `DEFAULT_PAGE_SIZE = 50`).
- `utils/format.ts` — хелпери форматування ціни (`formatPrice`), форматування дати
  (`formatDate`), відносного часу (`formatRelativeTime`, напр. «3 год тому» — для рядка
  стану панелі дій) та чистки HTML-опису (`stripDescriptionHtml`).
- `utils/status.ts` — `STATUS_LABELS`/`STATUS_COLORS` (Record по `ListingStatus`: `new` blue,
  `interested` green, `contacted` purple, `rejected` gray, `disabled` red) та
  `isMutedStatus(status)` (`disabled`/`rejected` → приглушений рядок).
- `stores/listingsUiStore.ts` — Zustand-стор `useListingsUiStore`: `statusFilter: ListingStatus | 'all'`
  (дефолт `'all'`) + `setStatusFilter`. Спільний in-memory стан вкладки фільтра статусів,
  що читається і в `ListingsFilterBar` (для `SegmentGroup`), і в `AnalysisWizardDialog`
  (scope «поточна вкладка»).
- `stores/analysisWizardStore.ts` — Zustand-стор `useAnalysisWizardStore`: прогрес AI-Flow
  (`mode`, `scope: 'selected'|'all'|'tab'`, `step`, `available`, `selected: Set<string>`,
  `customInput`, `accumulated`, `includedOverrides: Map<string,boolean>`), `boundSearchId`,
  `criteriaLoadedMode`. Дії: `bindSearch(id)` — скидає лише якщо змінився пошук;
  `reset()` — повне скидання. In-memory (не persisted): переживає закриття/відкриття
  модалки, але скидається при refresh сторінки.
- `hooks/useListingsTableState.ts` — кастомний React-хук для збереження та завантаження стану сортування, розмірів колонок та пагінації (`pageSize` персиститься, `pageIndex` — ні) таблиці.
- `hooks/useAutoRefresh.ts` — `useAutoRefresh(enabled, intervalMin)`: поки увімкнено і вкладка
  видима, раз на `intervalMin` хвилин послідовно запускає `useScan({deep:false})` для всіх
  пошуків (пауза 5–10с між ними), пропускаючи тік якщо вже триває скан
  (`queryClient.isMutating({mutationKey:['scan']})`). Toast на старті і підсумковий
  (`+N нових` або тихий «новин немає»). Глибокий скан/verify не запускає.
- `hooks/useIsMobile.ts` — `useIsMobile()`: `useBreakpointValue({ base: true, md: false }) ??
  false` — єдине джерело "мобільний/desktop" для умовного рендеру (size/layout
  branching), напр. у `Searches.tsx` та `AnalysisWizardDialog.tsx`. Breakpoint —
  Chakra default `md` (768px).
- `components/table/` — ізольовані компоненти таблиці оголошень:
  - `HeaderLabel.tsx` — заголовок колонки з відповідною Lucide-іконкою.
  - `columns.tsx` — визначення колонок для TanStack Table (включно з display-колонкою
    `select` для bulk-дій, 36px, `enableSorting/enableResizing/enableHiding: false`) та
    список `TOGGLEABLE_COLUMNS` (без `select`).
  - `ListingsTableHeader.tsx` — заголовок таблиці `<thead>` із підтримкою сортування та
    ресайзу колонок (`columnResizeMode: 'onEnd'`); ресайз-хендл рендериться лише якщо
    `header.column.getCanResize()`.
  - `ListingsTableBody.tsx` — тіло таблиці `<tbody>`, яке рендерить рядки.
  - `ListingsTableRow.tsx` — рядок таблиці, обгорнутий у `React.memo` (економія ререндерів
    на вибір рядка/typing/пагінацію). **Увага:** TanStack Table НЕ перестворює об'єкт `row`
    при зміні порядку чи видимості колонок, тож `arePropsEqual` ОБОВ'ЯЗКОВО має містити
    `columnLayoutKey` (підпис `table.getVisibleLeafColumns()`, прокидається з
    `ListingsTable.tsx` через `ListingsTableBody`). Без нього memo пропускає ререндер і тіло
    розсинхронізовується із заголовком при reorder/toggle колонок (доводиться робити
    refresh). Рядки `status='disabled'`/`'rejected'` — приглушені (`isMutedStatus`).
  - `StatusCell.tsx` — компактний `NativeSelect` зі статусом у вигляді кольорового
    бейджа (`STATUS_COLORS`); зміна → `useUpdateListing()` (`status_source='manual'`,
    `miss_count=0`).
  - `NoteCell.tsx` — обрізаний текст нотатки (`lineClamp 2`); клік відкриває
    `Popover.Root`/`Portal` з `Textarea` + кнопкою «Зберегти» (PATCH `note`). Portal —
    рендериться в `document.body`, не обмежений `overflow:auto` контейнером таблиці.
  - `ProsConsCell.tsx` — комірки для колонок «Плюси» та «Мінуси», поведінка аналогічна
    до `NoteCell.tsx`, але з відповідними іконками та кольорами. Колонки сортовані за
    кількістю пунктів (`countProsConsItems` з `utils/format.ts`, один непорожній рядок =
    один пункт) із `sortDescFirst: true` — перший клік ставить угору оголошення з
    найбільшою кількістю плюсів/мінусів.
  - `HighlightText.tsx` — підсвічує всі збіги пошукового запиту в тексті через
    `<Mark bg="yellow.subtle">`; використовується в колонках «Назва»/«Опис» і в
    `DescriptionTooltip`.
  - `ListingsFilterBar.tsx` — панель над таблицею: `SegmentGroup` фільтра статусів (Всі +
    `LISTING_STATUSES`, з лічильниками з урахуванням toggle filtered_out) — читає/пише
    `statusFilter` через `useListingsUiStore` напряму (не через props); `Switch`
    «Показати відфільтровані», `Input` текстового пошуку із кнопкою очищення.
  - `BulkActionBar.tsx` — з'являється, коли є вибрані рядки: «Вибрано: N» + `Menu` зі
    статусами (`LISTING_STATUSES`/`STATUS_LABELS` з відповідними іконками) → `Promise.allSettled` з
    `useUpdateListing().mutateAsync()` по кожному `id` (підсумковий toast), і «Скасувати»
    (`setRowSelection({})`).
  - `DescriptionTooltip.tsx` — інтерактивний тултіп з прокруткою для попереднього перегляду тексту опису. Клік по вмісту відкриває `DescriptionDialog`.
  - `TablePagination.tsx` — панель пагінації під таблицею: `Pagination.Root` (Chakra UI v3) з номерами сторінок, prev/next, текстом «N–M з T» та селектором розміру сторінки (25/50/100/200). Прихована, якщо рядків ≤ 25.
- `App.tsx` — компоновка сторінки (Header, Searches sidebar, ListingsTable). Керує станом видимості бічної панелі (`searchesVisible`). `selectedId` може стати `null` (видалення активного пошуку) — тоді `ListingsTable` показує заглушку «Обери пошук зліва». `useAutoRefresh(autoRefreshEnabled, autoRefreshIntervalMin)` викликається тут.
- `components/Header.tsx` — шапка сайту («OLX Dashboard» + бейдж «авто: N хв» (`LuTimer`), кнопка згортання/розгортання бічної панелі, інформація про активний обраний пошук з підсвіткою, `SearchActionPanel` (кнопка виклику модального вікна) та `SettingsDrawer`). Responsive: зовнішній `HStack` з `wrap="wrap" rowGap={2}` (права група кнопок переноситься на новий рядок на вузьких екранах); текст «OLX Dashboard» прихований на `base` (іконка лишається); бейдж вибраного пошуку — `ml={{ base: 0, md: '80px' }}` з `lineClamp={1}`/`maxW={{ base: '40vw' }}`.
- `components/DescriptionDialog.tsx` — модальне вікно повного опису оголошення (`DialogRoot
  size="lg" placement="center" scrollBehavior="inside"`): фото/назва/ціна/місто в хедері,
  повний текст опису (скрол) у тілі, «Відкрити на OLX» + «Закрити» у футері. Відкривається
  кліком по комірці «Опис» (`ListingsTable.tsx` тримає `descriptionListing` стан).
- `components/SearchActionPanel.tsx` — модальне вікно дій вибраного пошуку (`DialogRoot`),
  що викликається кнопкою "Сканувати" з `Header.tsx`. Містить рядок стану з `useSearchStats()`
  (статистика бази, останній скан), прогрес-бар поточного скану та три кнопки дій:
  «Швидкий скан» / «Глибокий скан» / «Перевірити неактивні (N)». Глибокий скан відкриває
  додатковий `ConfirmActionDialog`. Усі кнопки блокуються під час активного скану.
- `components/SearchFiltersDrawer.tsx` — Drawer редактора `local_filters` (відкривається з
  3-dot меню пошуку → «Фільтри»): стоп-слова як `Tag.Root` chips + `Input` з Enter; діапазони
  — рядки `NativeSelect` (ключі з `useParamKeys`) + `Input` мін/макс + кнопка видалення,
  «Додати правило». «Зберегти» → `useUpdateSearchFilters()` → toast з
  `filtered_out_count`.
- `components/ConfirmActionDialog.tsx` — спільний діалог підтвердження довгої дії
  (`DialogRoot role="alertdialog"`, патерн діалогу видалення пошуку): title/description/
  confirmLabel + `Checkbox` «Більше не питати» (`onConfirm(skipNextTime)`). Використовується
  для глибокого скану в `SearchActionPanel`; для verify — заплановано (A3).
- `components/Searches.tsx` — бічна панель (sidebar), містить акордеон («Пошуки» / «Новий пошук»), форму створення. Може бути згорнутою (collapsible) для розширення простору таблиці. На мобільному (`useIsMobile()`) той самий вміст рендериться всередині overlay `DrawerRoot placement="start" size="xs"` (керується пропом `visible`/`onVisibleChange` з `App.tsx`); вибір пошуку (`SearchRow`) на мобільному автоматично закриває drawer. На desktop — без змін (постійна панель `w="80"`). Кожен `SearchRow`:
  - кнопки `LuChevronUp`/`LuChevronDown` для ручного сортування (`useReorderSearches`),
    disabled на краях списку;
  - 3-dot меню (`Menu.Root`, іконка `LuEllipsisVertical`) — «Фільтри» (`LuFilter`, відкриває
    `SearchFiltersDrawer`), розділювач, «Видалити» (`LuTrash2`, `color="fg.error"`,
    відкриває `DialogRoot role="alertdialog"` із підтвердженням і каскадно видаляє пошук
    через `useDeleteSearch`; якщо видалено активний пошук — `onSelect(null)`).
- `pages/ListingsTable.tsx` — відображення списку оголошень: збирає разом
  `useListingsTableState`, колонки, `ListingsFilterBar` (фільтр статусу з `useListingsUiStore` +
  toggle filtered_out + текстовий пошук → `globalFilter`/`globalFilterFn` по title+description),
  `BulkActionBar` (за наявності `rowSelection`), `ListingsTableHeader`/`ListingsTableBody`/
  `TablePagination`/`DescriptionDialog`. `rowSelection` (`getRowId: row => String(row.id)`,
  `enableRowSelection: true`) скидається при зміні `searchId`. Клієнтська пагінація через
  `getPaginationRowModel()` (TanStack Table v8) тримає DOM обмеженим розміром сторінки навіть
  для ~2000 оголошень (фікс зависання UI після глибокого скану — `docs/plans/listings-pagination.md`).
  Експортує `TOGGLEABLE_COLUMNS` для збереження зворотньої сумісності з `SettingsDrawer`.
- `components/settings/SettingsDrawer.tsx` — Drawer «Налаштування» (іконка-шестерня в шапці, `App.tsx`), що єднає три підкомпоненти з `web/src/components/settings/sections/`:
  - `VisualSection.tsx` — розділ «Візуальний вигляд»: перемикач теми light/dark (`useColorMode` з `@chakra-ui/react`), перемикач «Розширений перегляд опису (тултіп + модалка)» (`descriptionExpandEnabled`);
  - `AutoRefreshSection.tsx` — розділ «Автооновлення»: `Switch` автооновлення + `NativeSelect` вибору інтервалу (15/30/60 хв);
  - `ColumnsSection.tsx` — розділ «Колонки таблиці»: підтримка drag-and-drop перевпорядкування колонок (на базі `@dnd-kit`) та чекбокси видимості колонок таблиці (`TOGGLEABLE_COLUMNS`).
  Усі налаштування персистяться в `localStorage` (за допомогою хелперів із `web/src/utils/storage.ts`).
- `components/ui/` — Chakra UI v3 snippets, здебільшого додані через
  `npx @chakra-ui/cli snippet add` (`provider`, `color-mode`, `toaster`, `tooltip`, `drawer`,
  `switch`, `checkbox`, `close-button`); `dialog.tsx` написаний вручну за тим самим патерном
  (`DialogRoot`/`DialogContent`/`DialogHeader`/`DialogBody`/`DialogFooter`/`DialogCloseTrigger`/
  `DialogBackdrop`) — використовується `DescriptionDialog`, `ConfirmActionDialog` і діалогом
  підтвердження видалення.
- `components/analysis/` — майстер LLM-аналізу: `AnalysisWizardDialog.tsx` (`DialogRoot
  size={isMobile ? 'full' : 'xl'}`, `closeOnInteractOutside={false}` — прогрес не втрачається
  при кліку повз вікно; X і Esc лишаються); степер Критерії→Пошук→Перевірка→Вставка.
  **Тільки на кроці 1** — перемикачі Мінуси/Плюси та scope (Вибрані / [Назва вкладки] /
  Весь пошук); кнопка «Назва вкладки (N)» видима лише коли `statusFilter !== 'all'` (стор
  `listingsUiStore`); кроки 2–4 — read-only рядок «{режим} · {scope} (N)» у хедері.
  **Прогрес Flow в Zustand** (`analysisWizardStore`): `bindSearch(id)` скидає лише при зміні
  пошуку, закриття без commit зберігає крок/критерії/результати; після commit (крок 4) та
  «Почати заново» — `reset()`. Scope «tab» → `effectiveIds` = оголошення з поточним
  статусом вкладки (fallback на весь пошук якщо `statusFilter === 'all'`).
  Крок 2 (ручний режим) — кнопка «Завантажити ZIP-пакет»
  (`fetchAnalyzePackageZip`, `prompt.txt` + `analyze.py` + `patterns.example.json` +
  `descriptions/chunk-NNN.json`), `ManualAssistant`
  без `parts` (`emptyHint` з підказкою прогнати ZIP через агента/чат і вставити єдиний JSON); крок 3 —
  спільні рендер-фрагменти рядка (`renderPhotoTitle`/`renderDescriptionBlock`/
  `renderCriteriaTags`, без дублювання логіки toggle/evidence) рендеряться або в
  desktop-таблиці (Chakra `Table.Root`, `tableLayout: 'fixed'`, скрол `maxH="50vh"`), або —
  на мобільному — як стек карток (`Stack maxH="60vh" overflowY="auto"`, кожна картка `Box
  p={3} borderWidth="1px" rounded="md"` зі вмістом фото+назва → опис → теги): фото+назва |
  опис (`DescriptionTooltip`+`DescriptionDialog`, підсвітка `HighlightText` за evidence
  включених критеріїв, `lineClamp` 3 на desktop / 4 на мобільному) | теги критеріїв (клік —
  toggle include/exclude через
  `includedOverrides`, hover — tooltip з `evidence`, закреслення для виключених,
  пунктирна рамка для `!ok`); рядки без результатів (`items.length === 0`) приховані
  (лічильник «Показано N із M»); експорт Excel/JSON враховує toggle-стан; крок 4 — commit
  chunked (лише включені критерії) + `ConfirmActionDialog` при перезаписі непорожніх
  `pros`/`cons`) і `ManualAssistant.tsx` (панель ручного режиму: копіювати/завантажити
  промпт(и) + вставити відповідь, опціональний `emptyHint`). Кнопка «AI» (`LuSparkles`) —
  у `Header`; `rowSelection` піднято в `App.tsx` (передається в `ListingsTable` і як
  `selectedIds` у майстер).
- `components/settings/sections/AnalysisSection.tsx` — секція «AI-аналіз»: статус ключа
  (`useAnalysisStatus`), поле «Модель», `Switch` «reasoning», `Textarea` «Додаткові критерії»;
  персист у `SETTINGS_STORAGE_KEY` (`analysisModel`/`analysisReasoning`/`analysisExtraCriteria`).
- `components/table/ProsConsCell.tsx` — додано бейдж `LuTriangleAlert` (tooltip) при
  `analysis_stale=1` та tooltip «Аналіз: <model|ручний імпорт>, <дата>» при `analysis_at`.
- Vite proxy `/api → http://localhost:3001` (див. `web/vite.config.ts`).

## 8. Обробка помилок збору

- Ланцюжок стратегій: **GraphQL → HTML (автоматично в scanner) → `__NEXT_DATA__` →
  headed Playwright** (останні два не реалізовані — рішення людини).
- GraphQL-помилки (HTTP ≠ 200, `errors[]`, `ListingError`) → виняток → scanner пробує
  `HtmlOlxFetcher`; при успіху fallback скан вважається успішним, але в `scan_runs.error`
  пишеться позначка `graphql failed: ...; fallback html OK`.
- Падіння обох стратегій не валить процес: повна помилка у `scan_runs.error`, скан failed,
  попередні дані лишаються.
- Частковий успіх GraphQL (вікно пагінації `offset≤1000` вичерпано посеред скану,
  `docs/plans/graphql-offset-window.md`) — скан вважається успішним, зібрані дані
  зберігаються, `warning` (`graphql window cap hit at offset=<N>`) пишеться у
  `scan_runs.error`.
- Якщо HTML-сторінка не дала карток і немає `empty-state` — `HtmlOlxFetcher` **кидає виняток із
  зразком HTML** і ознакою наявності `__NEXT_DATA__`, а не переходить на браузер автоматично.
- Діагностика поломок — чекліст [`olx-api.md` §5](./olx-api.md).

## 9. Відомі відхилення від початкового канону

- 2026-06-10: заголовок HTML-картки OLX мігрував з `h6` на `h4` — селектор розширено до
  `h6, h4` (`server/src/scraper/selectors.ts`). Решта селекторів підтверджені робочими.
- 2026-06-10: канон змінено — основним методом збору став GraphQL (раніше: static HTML;
  заборону `api/v1/offers` знято після підтвердження живим тестом). Деталі —
  [`olx-api.md`](./olx-api.md), план — [`plans/graphql-migration.md`](./plans/graphql-migration.md).
