# План: двофазний глибокий скан — аналітична фаза + звіт перед повним сканом

## Контекст

Глибокий скан (`fetchSearchSplit`) досі виконував усе одним непереривним проходом: зондує
корінь → `probeMaxPrice` → бісекція цінового діапазону на бакети → одразу повна допагінація
всіх бакетів. Для великого пошуку (тим паче з синонімами) це триває й 10 хвилин, а користувач
до завершення не знає ні скільки оголошень у видачі, ні скільки запитів/часу лишилось, ні як
розбито діапазон.

Стара «оцінка» на фронті (`useSearchActionPanel.ts`) рахувалась з одного збереженого
`visible_total_count` минулого скану — груба, не знала реальної структури бакетів і не
враховувала синоніми окремо.

Мета: окрема дія «Аналіз» — виконує лише probe-фазу (root + probe ціни + бісекція × кожен
синонім), показує точний звіт (розбивка по синонімах, цінові бакети, ETA, оцінка нових vs уже
в БД) і дає кнопку «Запустити повний скан». Повний скан **перевикористовує** вже зібраний план
(межі бакетів + завантажені `page0`), не повторюючи probe.

## Дизайн звіту (за принципами скіла frontend-design)

Subject — план поглибленого збору з OLX, вісь розбиття — **ціна**. Job сторінки: за кілька
секунд дати рішення «запускати повний скан чи ні».

Signature-елемент — **«ціновий спектр»**: горизонтальна стрічка на весь ціновий діапазон,
посегментована на бакети (ширина сегмента ∝ ширині діапазону цін, інтенсивність ∝ кількості
оголошень). Для кількох синонімів — окрема стрічка під кожним. Hero — велика цифра ETA з рядом
опорних чисел (оголошень / запитів лишилось / діапазонів / ~нових). Один акцент із наявної
теми Chakra, `prefers-reduced-motion` поважається, видимий фокус, адаптив до мобільного.

## Файли

**Створити:** `web/src/components/searches/action-panel/ScanPlanReportDialog.tsx`.
**Змінити:** `server/src/scraper/graphql/fetcher.ts`, `server/src/scraper/graphql/types.ts`,
`server/src/scraper/normalizer.ts`, `server/src/scraper/constants.ts`, `server/src/types.ts`,
`server/src/scanner.ts`, `server/src/routes/searches.ts`, `server/src/db/schema.sql`,
`web/src/types/index.ts`, `web/src/api/scanner.ts`, `web/src/hooks/useSearchActionPanel.ts`,
`web/src/components/searches/action-panel/ActionPanelButtons.tsx`,
`web/src/components/searches/SearchActionPanel.tsx`.

## Кроки

### A. Backend — виокремлення probe-фази (`fetcher.ts`)
- [x] `graphql/types.ts`: новий internal-тип `SplitPlan` ({rootCount, buckets, rootItems,
  requestsUsed, noSplit, fallbackReason?}).
- [x] `fetcher.ts`: новий публічний `analyzeSplit(search, options?)` — витягнута логіка
  root-probe + `resolveUpperPriceBound` + `bisectPriceRange`, повертає `SplitPlan` (без
  допагінації бакетів).
- [x] `resolveUpperPriceBound` спрощено: без вшитого fallback-виклику `fetchSearch` — лише
  `{upperBound, requestsUsed}`; рішення «що робити, якщо bound не знайдено» переїхало на
  викликача (`analyzeSplit`).
- [x] Новий публічний `scanFromPlan(search, plan, options?)` — обгортка над `scanBuckets`;
  для `plan.noSplit` делегує `fetchSearch` (з warning, якщо є `fallbackReason`).
- [x] `fetchSearchSplit` = `analyzeSplit` + `scanFromPlan` (поведінка ідентична, швидкий deep
  scan не зламано).
- [x] `estimatePages` зроблено `export` (потрібен для оцінки `remainingRequests` у звіті).

### B. Backend — типи DTO (`server/src/types.ts`)
- [x] `PriceBucketSummary`, `ScanPlanQuery`, `ScanPlan` (без важких `page0` — лише підсумки
  для фронта).

### C. Backend — оркестрація (`scanner.ts`)
- [x] `selectKnownOlxIds(ids)` у `normalizer.ts` — батч-перевірка, які `olx_id` вже в БД (для
  оцінки «~нових»).
- [x] In-memory кеш планів (`Map<token, {searchId, deep, plans, createdAt}>`, TTL 30 хв).
- [x] `analyzeScan(searchId, {deep})` — цикл по `dedupeQueries([query, ...synonyms])`,
  `graphqlFetcher.analyzeSplit` на кожен варіант, пауза між варіантами; агрегує `ScanPlan`,
  пише прогрес у `scan_runs` (`kind='analyze'`).
- [x] `runDeepScanFromPlan(searchId, planToken)` — дістає кеш, для кожного варіанта
  `graphqlFetcher.scanFromPlan`, зливає по `olx_id`, далі стандартний хвіст `runScan`
  (upsert, `applyScanStatuses` лише якщо `!partial`, оновлення `visible_total_count`,
  фіналізація `scan_runs` з `kind='deep'`). Прострочений/невідомий токен → зрозуміла помилка.

### D. Backend — роут + схема
- [x] `POST /api/searches/:id/scan/analyze?deep=true` → `ScanPlan`.
- [x] `POST /api/searches/:id/scan/run-plan` (body `{planToken}`) → `ScanResult`.
- [x] `GET /api/searches/:id/stats`: `last_scan` виключає `kind='analyze'` (банер не
  забруднюється аналізом).
- [x] `schema.sql`: коментар `kind` доповнено `| analyze`.

### E. Frontend — API + хук
- [x] `web/src/types/index.ts`: дзеркальні `PriceBucketSummary`/`ScanPlanQuery`/`ScanPlan`.
- [x] `web/src/api/scanner.ts`: `useAnalyzeScan()`, `useRunScanPlan()`.
- [x] `useSearchActionPanel.ts`: `scanKind` + `'analyze'`; `startAnalysis()` → зберігає план,
  відкриває звіт; `runPlan()` → запускає повний скан із токеном; обробка простроченого плану.

### F. Frontend — UI
- [x] `ActionPanelButtons.tsx`: окрема картка «Аналіз перед сканом».
- [x] Новий `ScanPlanReportDialog.tsx` — ціновий спектр + ETA + розбивка по синонімах.
- [x] `SearchActionPanel.tsx`: підключення діалогу-звіту.

### G. Документація
- [x] Оновити `CLAUDE.md` (опис глибокого скану), `docs/architecture.md`,
  `docs/structure.md`, `docs/olx-api.md` §2.9.

## Test-cases (ручна перевірка користувачем)

1. Малий пошук (<1000): «Аналіз» → звіт із 1 діапазоном, ETA ~1 хв → «Запустити повний скан» →
   результат як у звичайного deep scan.
2. Великий пошук (>1000, split): звіт показує кілька цінових бакетів у стрічці спектра →
   запуск без повторної бісекції.
3. Синоніми (>1): звіт має секцію на кожен синонім; повний скан зливає по `olx_id`,
   `partial=true`.
4. Probe ціни невдалий: звіт показує warning «без верхньої межі ціни»; запуск = звичайний
   deep + warning.
5. Прострочений план: «Запустити повний скан» після TTL → зрозумілий тост, без 500.
6. Банер `last_scan` не показує запис аналізу.
7. Швидкий глибокий скан (без аналізу) — без регресій.

## Доповнення — TTL 30 хв + часова валідність звіту (2026-06-20)

- TTL кешу плану піднято 15→30 хв. Винесено в іменовані константи: `PLAN_TTL_MIN`
  (`server/src/scanner.ts`) ↔ `SCAN_PLAN_TTL_MIN` (`web/src/constants.ts`, дзеркало для UI-тексту).
- **Валідність звіту (`planValid`) тепер часова, а не від in-memory кешу.** Раніше
  `GET /last-analysis` рахував `planValid = isPlanCached(token)` — план «застарівав» миттєво при
  втраті кешу (перезапуск `tsx watch`, закриття діалогу після одноразового запуску). Тепер
  `planValid = isAnalysisFresh(finished_at)` — true протягом TTL незалежно від кешу.
- **Стійкий запуск:** якщо швидкого плану під токеном уже немає, але аналіз свіжий (≤ TTL),
  `runDeepScanFromPlan` робить повний `runScan deep` (повторне зондування) замість помилки
  «План застарів». Помилка лишається лише для справді протермінованого (> TTL) аналізу.
