# Рефакторинг: прагматична чиста архітектура

> **Статус:** 🟢 активний · план складено 2026-10-22, чекає підтвердження людини; код ще не змінювався

## Контекст

Мета людини (2026-10-22): розділити складний код на менші окремі частини, прагматична «чиста архітектура», оновити
документацію (далі — `/docs-audit`). Обсяг — `server/` і `web/`. Глибина — прагматична: тонкі маршрути → сервіси →
репозиторії (SQL), без DI-контейнерів і без шарів «заради шарів».

**Головне правило:** поведінка не змінюється. Кожна фаза — окремий PR з зеленим `npm run check` + `npm run build`.
Ті самі SQL-запити і та сама їх кількість (Turso-економія, `AGENTS.md`): переносимо, а не переписуємо.

### Що показав аналіз (2026-10-22)

| # | Знахідка | Де | Впевненість |
|---|---|---|---|
| A1 | **SQL розкиданий по шарах.** Лише AI має свій репозиторій (`analysis/repo.ts`); решта пише SQL прямо в маршрутах, сканері, скрейпері | `routes/searches.ts` (найбільше), `routes/projects.ts`, `routes/categories.ts`, `routes/listings.ts`, `routes/logs.ts`, `scanner/verifyScan.ts`, `scanner/scanRunLifecycle.ts`, `scanner/scanFinalize.ts`, `scanner/analyzeScan.ts`, `scanner/searchLoader.ts`, `categories/tree.ts`, `analysis/baseCriteria.ts`, `analysis/remap.ts` | висока |
| A2 | **Бізнес-логіка в маршрутах.** Маршрут сам будує `UPDATE` з полів, рахує сусіда для сортування, агрегує `param-keys` / `filter-options`, виконує весь use-case перейменування базових критеріїв (≈110 рядків) | `routes/searches.ts`, `routes/projects.ts`, `routes/categories.ts` → `POST /api/categories/:id/criteria/remap` | висока |
| A3 | **Скрейпер (збір з OLX) пише в БД.** `normalizer.ts` змішує розбір даних OLX і upsert у `listings`; `statusEngine.ts` і `refilter.ts` — доменні правила разом із SQL | `scraper/normalizer.ts`, `scraper/statusEngine.ts`, `scraper/refilter.ts` | висока |
| A4 | **Дубль циклу варіантів запиту.** `runDeepScanFromPlan` (≈170 рядків) повторює цикл «синоніми → GraphQL → HTML-fallback → злиття → пауза», який уже є в `fetchAllQueries` | `scanner/analyzeScan.ts` ↔ `scanner/fetchOrchestrator.ts` | висока |
| A5 | **Кеш планів глибокого скану змішано з аналізом.** `planCache`, TTL і `isAnalysisFresh` живуть у тому ж файлі, що зондування | `scanner/analyzeScan.ts` | висока |
| A6 | **Однакова обробка помилок у кожному маршруті:** `try/catch → app.log.error → 500 {error}`, ручні `404 «Пошук не знайдено»` | `routes/searches.ts` та інші | висока |
| A7 | **CLI-скрипти в корені `server/src/`** поруч із `index.ts` | `scan.ts`, `collectCategories.ts`, `copyProd.ts`, `jevPilot.ts`, `jevProbe.ts`, `llmEval.ts`, `migratePostedAt.ts` | висока |
| A8 | Імпорт «убік»: `scraper/localFilters.ts` бере `parseBullets` з `analysis/text.ts` | `scraper/localFilters.ts` | середня (дрібне) |
| W1 | **Фронтенд уже шаровий** (`api/` — хуки TanStack Query, `hooks/`, `utils/`, `stores/`, компоненти без прямих запитів). Потрібні лише тактичні розрізи великих файлів | `ScanPlanReportDialog.tsx`, `CategoryFilter.tsx`, `useSearchActionPanel.ts`, `SearchFiltersDrawer.tsx`, `table/columns.tsx` | висока |

Поза скоупом: `jevPilot.ts` (інструмент розробника; лише переноситься в `cli/`), промпти (`analysis/prompts.ts` — єдине
джерело за інваріантом, великий за змістом, не за логікою), схема БД.

## Цільова архітектура (сервер)

```
routes/        HTTP: розбір запиту, валідація, виклик сервісу, код відповіді. Без SQL.
services/      use-cases CRUD-сутностей (searches, projects, listings, logs). Без Fastify.
scanner/       use-cases скану (як зараз), без SQL — через репозиторії.
analysis/      AI-логіка (як зараз), без SQL — через репозиторії.
categories/    дерево категорій (як зараз), без SQL.
scraper/       лише OLX: запити, розбір, нормалізація, чисті доменні правила. Без БД.
db/            db.ts (клієнт, initDb), schema.sql, repos/<сутність>.ts — ЄДИНЕ місце SQL.
cli/           точки входу npm-скриптів.
errors.ts      NotFoundError / BadRequestError / ConflictError → один обробник помилок Fastify.
```

Напрям залежностей: `routes → services/scanner/analysis/categories → scraper (чисте) + db/repos → db.ts`. Знизу
вгору — заборонено (перевірка — крок 1.4).

## Файли

| Файл | Зміна | Залежності |
|---|---|---|
| `src/errors.ts` (новий) | створити | блокує фази 2–5 |
| `server/src/index.ts` | обробник помилок (`setErrorHandler`) | після 1.2 |
| `server/src/db/repos/*.ts` (`searches`, `projects`, `listings`, `scanRuns`, `categories`, `baseCriteria`, `logs`, `analysis`) | створити | блокує фази 2–6 |
| `server/src/analysis/repo.ts` | злити в `db/repos/analysis.ts`, видалити | фаза 4 |
| `server/src/services/{searches,projects,listings,logs}.ts` | створити | фази 2–3 |
| `server/src/routes/*.ts`, `routes/analysis/*.ts` | спростити до HTTP | після своїх сервісів |
| `src/analysis/baseCriteriaRemap.ts` (новий) | створити (use-case з маршруту) | фаза 4 |
| `src/scanner/planCache.ts` (новий) | створити (з `analyzeScan.ts`) | фаза 5 |
| `server/src/scanner/analyzeScan.ts`, `fetchOrchestrator.ts` | прибрати дубль циклу | фаза 5 |
| `server/src/scraper/normalizer.ts` | лишити чистий розбір; upsert → `db/repos/listings.ts` | фаза 6 |
| `server/src/scraper/statusEngine.ts`, `refilter.ts` | чисті рішення лишити; запис → репозиторій/сервіс | фаза 6 |
| `server/src/cli/*.ts` | перенести CLI-скрипти | фаза 1 |
| `server/package.json` | шляхи CLI-скриптів | фаза 1 |
| `check-layers.mjs` (новий, у `scripts/`), `package.json` (`check`) | створити перевірку шарів | фаза 1 |
| `web/src/...` (5 файлів W1) | розрізати на підкомпоненти/хуки | фаза 7 |
| `docs/architecture.md`, `docs/structure.md`, `AGENTS.md` («Конвенції»), `docs/development.md` | оновити | кожна фаза + фаза 8 |

## Кроки

Кожна фаза: гілка `refactor/<фаза>` → правки → `npm run check` + `npm run build` → локальний smoke (`npm run dev`,
test-cases фази) → оновити `architecture.md`/`structure.md` → PR → зелений CI → злиття лише з «так» людини
(злиття = деплой).

### Фаза 0. Страхувальна сітка (тести до правок)

- [x] 0.1 Перевірити, які маршрути вже покриті тестами (`routes/*.test.ts`: searches, listings, categories,
      analysis/criteria; relevance і matching — через `analysis/jevEngine.test.ts`).
- [x] 0.2 Додати характеризаційні тести (фіксують поточну поведінку) там, де їх нема: `routes/projects.test.ts`
      (CRUD + `move`), `routes/logs.test.ts`; у `routes/searches.test.ts` — `move`, `delete` (каскад), `param-keys`,
      `filter-options`, `last-analysis`, якщо бракує.
      Зроблено: усі маршрути `searches.ts` без звернення до OLX (+ `run-plan` 400/410, `stop`, `verify` 404, `stats`,
      `scan-status`); `PATCH /api/listings/:id` у `routes/listings.test.ts` (ручний статус, override AI і активності).
- [x] 0.3 Тест на `runDeepScanFromPlan` з підміненим fetcher-ом: кілька варіантів, збій пізнього варіанта (скан не
      падає, warning), прострочений план → 410-гілка (перед фазою 5).
      Зроблено: `scanner/variantLoop.test.ts` — обидва цикли (звичайний скан із синонімами і глибокий за планом),
      тексти warning/error дослівно, одноразовий токен, чужий план.
- [x] Verify: `npm test` зелений; нові тести проходять на поточному коді **без** змін коду.

> **Знахідка фази 0 (для фази 5):** цикли відрізняються не лише рядком журналу (`variant` / `plan-variant`), а й
> прогресом (кумулятивний `maxTotal` проти наперед порахованого `plannedTotal`), перевіркою «Зупинити» на початку
> кожного варіанта (лише в плані) і обробкою одного варіанта (звичайний скан делегує `fetchWithFallback` без
> multi-query-нот). Злиття — лише з параметрами під ці відмінності; якщо виходить складніше за дубль — лишити
> дубль і винести спільні шматки (рішення людини на фазі 5).

### Фаза 1. Каркас

- [x] 1.1 Перенести CLI-скрипти в `server/src/cli/` (`git mv`), виправити імпорти й `server/package.json`.
      Шляхи до `server/data/` у `copyProd`, `jevPilot`, `jevProbe`, `llmEval` — на рівень глибше.
- [x] 1.2 `server/src/errors.ts`: `HttpError` + `NotFoundError`, `BadRequestError`, `ConflictError`, `GoneError`
      (410 для застарілого плану) з `statusCode`.
- [x] 1.3 Глобальний обробник уже був у `index.ts` і відповідав `{ error: message }` з `err.statusCode` (5xx — у
      журнал `app_logs`). Винесено без змін у `server/src/routes/errorHandler.ts`; тести роутів отримують той самий
      обробник через `testApp()` (`server/src/test/app.ts`).
      ⚠ Для фаз 2–4: прибрати `try/catch` з роуту = його 500 почне писатися в журнал `app_logs` (зараз роути пишуть
      лише `app.log.error` у stdout). Де це небажано — лишати локальний `catch`.
- [x] 1.4 `scripts/check-layers.mjs` у `npm run check` (`npm run layers:check`): правила для `routes/`, `services/`,
      `scraper/`, `db/`, `scanner/`, `analysis/`, `categories/`, `cli/`. Режим «лише звіт» на старті показав рівно
      знахідки A1/A3: 12 файлів у `routes/` і `scraper/` + 9 у доменних модулях. «Строгий» (`--strict`) — після фази 6.
- [x] Verify: `npm run check`, `npm run build` зелені; `npm run scan` і `npm run llm:eval` стартують з нового шляху
      (друкують підказку без аргументів); зібраний сервер (`node dist/index.js`) на 404/400 відповідає `{ error }`
      як раніше.

### Фаза 2. Пошуки (`searches`) — найбільший маршрут

- [ ] 2.1 `db/repos/searches.ts` + `db/repos/scanRuns.ts`: перенести SQL з `routes/searches.ts` дослівно.
- [ ] 2.2 `services/searches.ts`: create (сортування згори), update (+ перерахунок `filtered_out` і автокатегорії),
      delete (каскад), move, paramKeys, filterOptions, lastAnalysis, stats.
- [ ] 2.3 `routes/searches.ts` → лише HTTP; 404/400/410 — через `errors.ts`.
- [ ] Verify: `routes/searches.test.ts` зелений без зміни очікувань; test-cases 1–3.

### Фаза 3. Проєкти, оголошення, журнал

- [ ] 3.1 `projects`, `listings`, `logs`: репозиторій + сервіс + тонкий маршрут (як фаза 2).
- [ ] Verify: тести маршрутів зелені; test-cases 4–5.

### Фаза 4. Категорії й AI

- [ ] 4.1 `analysis/baseCriteriaRemap.ts`: перенести use-case з `POST /api/categories/:id/criteria/remap`; маршрут
      лише валідує й викликає. Unit-тест use-case на тимчасовій БД.
- [ ] 4.2 SQL з `routes/categories.ts`, `categories/tree.ts`, `analysis/baseCriteria.ts`, `analysis/remap.ts`,
      `routes/analysis/*`, `routes/aiPicks.ts`, `routes/relevance.ts` → `db/repos/{categories,baseCriteria,analysis}.ts`;
      `analysis/repo.ts` злити в `db/repos/analysis.ts`.
- [ ] Verify: `categories.test.ts`, `baseCriteria.test.ts`, `remap.test.ts`, `jevEngine.test.ts` зелені; test-case 6
      (без платних AI-кнопок).

### Фаза 5. Сканер

- [ ] 5.1 `scanner/planCache.ts`: `planCache`, TTL, `isPlanCached`, `isAnalysisFresh`, очищення.
- [ ] 5.2 Прибрати дубль A4: спільний цикл варіантів у `fetchOrchestrator.ts` з параметром «як отримати один
      варіант» (звичайний fetch / за планом). `runDeepScanFromPlan` лише готує план і викликає спільний цикл.
      Тексти warning/notes і прогрес (`stage`, `subDone`) — байт-у-байт як зараз.
- [ ] 5.3 SQL з `verifyScan.ts`, `scanRunLifecycle.ts`, `scanFinalize.ts`, `searchLoader.ts`, `analyzeScan.ts` →
      `db/repos/{scanRuns,listings,searches}.ts`.
- [ ] Verify: тести фази 0.3 + `fetchOrchestrator`, `scanFinalize`, `scanRunLifecycle`, `verifyScan` зелені;
      test-cases 7–8 (звичайний і глибокий скан — живі запити до OLX, ввічливо: по одному).

### Фаза 6. Скрейпер без БД

- [ ] 6.1 `normalizer.ts`: чистий розбір (`parsePrice`, дати, `hasBusinessChange`) лишається; `upsertListings`,
      `loadExistingByOlxId`, `selectKnownOlxIds` → `db/repos/listings.ts` (статементи й батчі — ті самі).
- [ ] 6.2 `statusEngine.ts`: функція «які статуси змінити» (чиста) + запис через репозиторій одним атомарним
      `db.batch` (як зараз — неідемпотентне `miss_count + 1`).
- [ ] 6.3 `refilter.ts` → `services/` (читання/запис через репозиторій), правила фільтрів лишаються в `localFilters.ts`.
- [ ] 6.4 `parseBullets` (A8) → спільний модуль без залежності `scraper → analysis`.
- [ ] 6.5 `check-layers.mjs` → строгий режим.
- [ ] Verify: `normalizer.test.ts`, `statusEngine.test.ts`, `refilter.test.ts`, `localFilters.test.ts` зелені;
      test-cases 7, 9.

### Фаза 7. Фронтенд — тактичні розрізи

- [ ] 7.1 `ScanPlanReportDialog.tsx` → форматери в `utils/format.ts`, `PriceSpectrum` / `QuerySection` / `StatChip`
      — окремі файли в `action-panel/scan-plan/`.
- [ ] 7.2 `CategoryFilter.tsx` → `CategoryRow`, `CountChip` окремо; чиста логіка дерева — в `utils/`.
- [ ] 7.3 `useSearchActionPanel.ts` → стан запуску скану / стан звіту аналізу — два хуки; `describeScanResult` —
      в `utils/`.
- [ ] 7.4 `SearchFiltersDrawer.tsx`, `table/columns.tsx` — лише якщо після 7.1–7.3 лишаються змішані
      відповідальності (рішення людини).
- [ ] Verify: `npm run typecheck`, `npm run build`; test-cases 2, 3, 8.

### Фаза 8. Документація

- [ ] 8.1 `architecture.md` §4 «Модулі бекенду» — шари й напрям залежностей; `structure.md` — нові теки.
- [ ] 8.2 `AGENTS.md` → «Конвенції»: правило «SQL лише в `db/repos/`, маршрути без SQL» (зміна конвенції — лише з
      «так» людини).
- [ ] 8.3 `/docs-audit` — повний аудит документації й парковки.
- [ ] 8.4 План → ✅, `git mv` у `docs/plans/old/`.

## Test-cases

Автоматичні — Vitest (фаза 0 і наявні). Ручні — нижче; **перед передачею людині агент проходить кожен шлях у браузері
й звіряє назви з екраном** ([manual-test-cases](../instructions/manual-test-cases.md)). Усі — локально (`npm run dev`,
http://localhost:5173), без платних AI-кнопок.

| # | Що зробити | Що маєш побачити |
|---|---|---|
| 1 | Ліва панель → кнопка «Новий пошук» → заповнити назву й запит → зберегти | Новий пошук з'явився **першим** у списку своєї групи |
| 2 | У рядку пошуку кнопка «Дії з пошуком» → «Редагувати» → змінити назву → зберегти | Назва в лівій панелі оновилась; таблиця не порожня |
| 3 | Відкрити пошук → кнопка «Фільтри» → змінити ціновий діапазон → застосувати | Таблиця перерахувалась; числа біля категорій у фільтрі «Категорії» дорівнюють «Всього» (як до рефакторингу) |
| 4 | У рядку пошуку кнопки «Пересунути вгору» / «Пересунути вниз» | Пошук міняється місцями з сусідом лише всередині свого проєкту |
| 5 | «Дії з проектом» → «Перейменувати»; потім «Дії з пошуком» → «Перемістити в проект» → «Без проекту» | Проєкт перейменовано; пошук переїхав у групу «Без проекту» |
| 6 | Відкрити діалог базових плюсів і мінусів категорії → перейменувати власний пункт | Пункт перейменовано; у пошуках цієї категорії оголошення з цим пунктом показують нову назву |
| 7 | Обраний пошук → звичайний скан | Скан завершується без помилки; лічильники «нових» і час останнього скану оновились |
| 8 | Обраний пошук → «Аналіз перед сканом» → у звіті запустити глибокий скан | Звіт (діапазони, запити) як раніше; прогрес іде, скан завершується; на кількох синонімах — етапи «Синонім «…» (1/N)» |
| 9 | Після скану 7 — таблиця оголошень | Статуси (нові / неактивні) як до рефакторингу; ручні статуси не змінились |

## Відкат

- Кожна фаза — окремий PR без зміни схеми БД і даних: відкат = revert PR (або Render «Rollback» на попередній
  деплой, `deploy-render-turso.md` → «Реліз, відкат, бекап»).
- Найризиковіші — фази 5 і 6 (скан, upsert, статуси): зливати окремо, після злиття — `npm run smoke` і один звичайний
  скан на проді з моніторингом ([prod-scan-monitoring](../instructions/prod-scan-monitoring.md)). Помилка → revert,
  дані не постраждають (лише перенесення коду, SQL той самий).

## Ризики

| Ризик | Захист |
|---|---|
| Непомітна зміна поведінки (коди відповідей, тексти помилок, порядок записів) | Характеризаційні тести фази 0 до правок; SQL переноситься дослівно |
| Більше запитів до Turso після розділення (напр., `getSearch` двічі) | На кожен use-case — та сама кількість запитів; рев'ю дифу на нові `dbGet`; за сумніву — `turso-reads-playbook` |
| Фаза 5 ламає тексти прогресу / warning, на які дивиться UI (`ScanWarningSummary`) | Тест 0.3 перевіряє тексти дослівно |
| Атомарність: `statusEngine` (`miss_count + 1`) рознесено на кілька batch | Лишити один атомарний `db.batch`; тест на повторний виклик |
| Розмір PR, втома рев'ю | Одна фаза — один PR; фази 2–4 можна дробити далі по маршрутах |
