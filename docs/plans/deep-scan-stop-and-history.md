# План: статистика дедупу, зупинка скану та історія аналізу

## Контекст

Двофазний глибокий скан («Аналіз перед сканом» → звіт `ScanPlan` → підтверджений запуск)
має три прогалини UX:

1. **Розрив «4000 в аналізі → 2000 у реальному скані».** Звіт аналізу сумує
   `visible_total_count` кожного синоніма окремо (`scanner.ts` `analyzeScan`,
   `totalListings += plan.rootCount`) **без зняття перетину**. Реальний скан зливає видачі
   в один `Map<olxId>` (`fetchAllQueries`, `runDeepScanFromPlan`) → унікальних значно менше.
   Ліміти сторінок (40/стор., `MAX_PAGES=26` = жорстке вікно OLX `offset ≤ 1000`) обходяться
   price-split'ом; запобіжники `MAX_TOTAL_REQUESTS`/`MAX_BUCKETS` (на варіант) на ~80 запитах
   не спрацьовували. Користувач не бачить «скільки сирих / скільки злито дублів».
2. **Немає кнопки «Зупинити».** Скан синхронний; персист — одним `upsertListings` у кінці.
   Обірвав — зібране втрачено. Немає механізму abort.
3. **Аналіз зникає.** `ScanPlan` живе лише в in-memory кеші (TTL 15 хв) + локальному стані
   хука. Закрив діалог — звіт втрачено; немає «переглянути останній аналіз».

**Рішення:** (#1) запобіжники лишити + підняти, показувати обрізання; (#2) зупинка для всіх
сканів зі збереженням зібраного у БД; (#3) зберігати останній `ScanPlan` у БД і показувати
його при повторному заході в аналіз із кнопкою «Зробити новий аналіз».

## Файли

### Бекенд
- `server/src/scraper/graphql/constants.ts` — підняти `MAX_TOTAL_REQUESTS` 200→400,
  `MAX_BUCKETS` 40→60.
- `server/src/types.ts` — `ScanResult.rawFound`/`.stopped`; `FetchOptions.shouldAbort`;
  `FetchSearchResult.aborted`; `LastScanInfo.raw_found`; `ScanStatus.raw_found`.
- `server/src/scanner.ts` — abort-реєстр + `requestStopScan`; `rawTotal` tracking; персист
  `raw_found`/`scan_plan`; `isPlanCached`; зупинка в `runScan`/`runDeepScanFromPlan`/`runVerify`/
  `analyzeScan`.
- `server/src/scraper/graphql/fetcher.ts` — перевірки `shouldAbort` у циклах фетчерів.
- `server/src/scraper/olxFetcher.ts` — перевірка `shouldAbort` у HTML-циклі.
- `server/src/routes/searches.ts` — `POST /scan/stop`, `GET /last-analysis`; `raw_found` у
  `/scan-status` та `/stats`.
- `server/src/db/schema.sql` + `server/src/db/db.ts` — колонки `raw_found`, `scan_plan`.

### Фронтенд
- `web/src/types/index.ts` — дзеркало нових полів + `LastAnalysis`.
- `web/src/api/scanner.ts` — `useStopScan`, `useLastAnalysis`.
- `web/src/hooks/useSearchActionPanel.ts` — `stopScan`/`isStopping`, `startFreshAnalysis`,
  показ останнього аналізу, toast зі статистикою raw/merged та `stopped`.
- `web/src/components/searches/SearchActionPanel.tsx` — прокидання нових props.
- `web/src/components/searches/action-panel/ScanProgressPanel.tsx` — кнопка «Зупинити».
- `web/src/components/searches/action-panel/ScanPlanReportDialog.tsx` — «Зробити новий аналіз»,
  `planValid`, `analyzedAt`, нота про дедуп для multi-query.
- `web/src/components/searches/action-panel/ActionPanelLastScan.tsx` — розклад raw/merged.

## Кроки

- [ ] Частина 1: підняти запобіжники, додати `raw_found`, tracking + UI прозорості дедупу.
- [ ] Частина 2: abort-механізм, `POST /scan/stop`, кнопка «Зупинити», частковий персист.
- [ ] Частина 3: колонка `scan_plan`, `GET /last-analysis`, показ останнього аналізу + «Новий аналіз».
- [ ] Оновити `docs/architecture.md`, `docs/structure.md`, `CLAUDE.md`.
- [ ] `npm run build` без помилок.

## Тест-кейси

1. **Білд/міграції:** `npm run build` і `npm run dev` без помилок; `db.ts` додає `raw_found`/
   `scan_plan` на наявній БД без падіння.
2. **Зупинка:** старт скану → «Зупинити» → мутація резолвиться, у БД часткові оголошення,
   `scan_runs.warning` містить «Зупинено», вікно покриття не спрацювало.
3. **Дедуп:** пошук із синонімами → toast/останній скан показують «сирих/унікальних/дублів злито».
4. **Історія:** аналіз → закрити → знову «Аналіз перед сканом» показує збережений звіт із датою
   + «Зробити новий аналіз»; протермінований токен → primary disabled з нотою.

> ⚠️ Мережа build-середовища до OLX заблокована — живий скан у контейнері не тестується.
