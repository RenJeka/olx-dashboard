# План: авто-розбиття глибокого скану по цінових діапазонах

> Прогрес: познач `[x]` коли пункт виконано. Легенда: `[ ]` — заплановано, `[~]` — у роботі, `[x]` — готово.
>
> **Для виконавця:** інваріанти, які не можна порушувати без узгодженої зміни, — у
> [`../../CLAUDE.md`](../../CLAUDE.md). Деталі GraphQL/HTML збору — [`../olx-api.md`](../olx-api.md).
> Нічого не вигадуй поза цими файлами й цим планом; якщо чогось бракує — зупинись і спитай.

## Context

OLX GraphQL має жорстке **вікно пагінації**: `offset ≤ 1000` (верифіковано live
2026-06-12; `offset=1040` → `ListingError 400`). При `PAGE_LIMIT=40` це `MAX_PAGES=26`
сторінок → **максимум ~1040 оголошень за один GraphQL-запит-ланцюг**. Тому пошук із
`visible_total_count > 1040` (напр. «ipad 9» — 1258) глибокий скан **фізично не може
покрити повністю** — ~200 «хвоста» GraphQL не віддає.

Рішення (узгоджено з користувачем): коли глибокий скан бачить, що результатів більше за
вікно, він **автоматично розбиває діапазон цін на під-діапазони**, кожен з яких вкладається
у вікно (≤1000), сканує кожен окремо й зливає все в той самий пошук через upsert по `olx_id`
(дедуплікація вже гарантована — `normalizer.upsertListings`, `ON CONFLICT(olx_id)`).

Узгоджені рішення:
- **Тригер:** автоматично всередині наявної кнопки «Глибокий скан». Окремої кнопки немає.
  Малі пошуки (≤ вікно) працюють як зараз (один діапазон).
- **Стратегія меж:** адаптивна бісекція — пробуємо діапазон, читаємо `visible_total_count`;
  якщо > порога — ділимо навпіл і рекурсивно повторюємо, доки кожен «лист» не влізе у вікно.
  Стійко до нерівномірного розподілу цін (дешевих багато, дорогих мало).
- **Відкрита верхня межа (`to` не задано):** зондуємо максимальну ціну окремим запитом
  (сортування за ціною спадно). **⚠️ Потребує live-верифікації** — чи приймає OLX GraphQL
  сортування за ціною (зараз код хардкодить `sort_by=created_at:desc`, а ключ `order`
  ігнорується). Якщо не приймає — задокументований fallback (нижче).

## Поточний стан (де що лежить)

- `server/src/scraper/graphqlOlxFetcher.ts` — `fetchSearch(search, options)`: цикл по
  сторінках; `buildSearchParameters` робить `filter_float_price:from/:to`; deep-режим уже є
  (батчі по `BATCH_SIZE=3`, паузи 3–6с, ціль `min(DEEP_SAFETY_CAP, MAX_PAGES, ceil(count/40))`).
  Константи: `PAGE_LIMIT=40`, `MAX_OFFSET=1000`, `MAX_PAGES=26`.
- `server/src/scanner.ts` — `runScan(searchId, {deep})` → `fetchWithFallback` (GraphQL→HTML),
  потім `upsertListings`, потім (лише для повного GraphQL без warning) `applyScanStatuses`.
  Прогрес — `onProgress(done, total, method)` → `scan_runs.requests_done/requests_total`.
- `server/src/types.ts` — `ApiFilters.ranges.price.{from,to}`, `FetchOptions{deep,onProgress}`,
  `FetchSearchResult{listings,visibleTotalCount,requestsUsed,exhausted,warning}`, `ScanResult`.
- `web/src/components/SearchActionPanel.tsx` — картка «Глибокий скан»: оцінка
  `deepScanRequests/deepScanMinutes` з `visible_total_count`, confirm-діалог, toast, прогрес-бар
  (індетермінований поки `requests_total==null`).
- Дедуплікація: `server/src/scraper/normalizer.ts` `upsertListings` — `ON CONFLICT(olx_id)`,
  тому злиття перекривних меж бакетів коректне.

## Група A — Backend: оркестратор розбиття

### A1. `server/src/scraper/graphqlOlxFetcher.ts` — рефактор + новий оркестратор

- [ ] Винести приватний `fetchPage(search, offset, referer)` → `{ items, visibleTotalCount,
  listingError }` (один POST). Переписати наявний `fetchSearch` так, щоб він використовував
  `fetchPage` (поведінка без змін — регресій бути не повинно).
- [ ] Нові константи: `SPLIT_THRESHOLD = MAX_OFFSET` (1000 — поріг, за яким бакет ще ділиться);
  `MIN_PRICE_WIDTH = 1` (далі ділити нікуди); `MAX_BUCKETS = 40`, `MAX_TOTAL_REQUESTS = 200`
  (глобальні запобіжники проти лавини запитів).
- [ ] `probeMaxPrice(search)`: один запит, сортування за ціною спадно, `limit 1` → ціна
  верхнього. **Спершу верифікувати live**, що OLX приймає такий `sort_by`. Fallback, якщо ні:
  повернути `null` → оркестратор переходить у режим «вимагати явну `to`».
- [ ] `fetchSearchSplit(search, options)` — оркестратор глибокого скану з розбиттям:
  1. Визначити `lo = ranges.price.from ?? 0`, `hi = ranges.price.to ?? probeMaxPrice(search)`.
     Якщо `hi == null` (probe не спрацював і `to` не задано) → виконати **звичайний** глибокий
     `fetchSearch` (один діапазон) + `warning = 'split skipped: no upper price bound'`.
  2. **Фаза бісекції (probe):** черга інтервалів, старт `[lo, hi]`. Для кожного — `fetchPage`
     offset 0, прочитати `visibleTotalCount`. Якщо `≤ SPLIT_THRESHOLD` (або ширина
     `< MIN_PRICE_WIDTH`, або сягнуто `MAX_BUCKETS`) → це «лист»-бакет (зберегти разом із уже
     отриманою 0-ю сторінкою). Інакше — поділити на `[a, mid]` та `[mid+1, b]`, `mid=⌊(a+b)/2⌋`.
     Поки бісекція триває — `onProgress(done, null)` (індетермінований UI «Підготовка…»).
  3. **Фаза скану листів:** оцінити `requests_total ≈ Σ min(MAX_PAGES, ceil(bucketCount/40))`
     (+ уже зроблені probe-запити). Для кожного листа — допагінувати від offset 40 тим самим
     deep-патерном (батчі/паузи з `fetchPage`), накопичуючи у спільний `Map<olxId, RawListing>`
     (дедуп). Кумулятивно звітувати `onProgress(doneCumulative, totalEstimate, 'GraphQL')`.
     Поважати `MAX_TOTAL_REQUESTS`; рання зупинка бакета при сторінці `<40`.
  4. Повернути `FetchSearchResult`: `listings` (злиті), `visibleTotalCount` = count кореневого
     `[lo,hi]` (загальний по пошуку), `requestsUsed` = всі запити, `exhausted` за бакетами,
     `warning` = `split: N price buckets; coverage window skipped` коли бакетів > 1.

### A2. `server/src/scanner.ts`

- [ ] `fetchWithFallback`: у deep-гілці GraphQL викликати `fetchSearchSplit` замість `fetchSearch`
  (HTML-fallback лишається без розбиття — у нього немає `visible_total_count`).
- [ ] **Вікно покриття:** для скану з розбиттям (бакетів > 1) `applyScanStatuses` **НЕ запускати** —
  вісь `windowFloor` (last_refresh_at останнього елемента) невалідна для об'єднання кількох
  діапазонів (union не відсортований глобально за refresh). Реалізується природно: оркестратор
  ставить `warning` → у `runScan` `partial=true` → наявна умова `usedGraphql && !partial`
  пропускає coverage. Виродждений випадок (один бакет, без warning) — coverage працює як зараз.

### A3. `server/src/types.ts`

- [ ] Додати у `ScanResult` опційне `bucketsUsed?: number` (для toast/звіту);
  `FetchSearchResult` — опційне `bucketsUsed?: number`.
- [ ] Нові magic-значення тримати поряд з наявними константами у `graphqlOlxFetcher.ts`.

## Група B — Frontend: оцінки й тексти

### B1. `web/src/components/SearchActionPanel.tsx`

- [ ] Оцінка глибокого скану: якщо `visible_total_count > ~1000` — показати, що скан розіб'є
  на `ceil(count/1000)` діапазонів, перерахувати `deepScanRequests ≈ ceil(count/40)` (а не
  cap 26) і час. Оновити опис картки й текст confirm-діалогу («розіб'є на N цінових діапазонів,
  ~M запитів»).
- [ ] Toast після скану: додати `· діапазонів ${r.bucketsUsed}`, якщо повернуто > 1.
- [ ] Прогрес-бар не міняти структурно (індетермінований режим уже покриває фазу бісекції).

### B2. `web/src/api/client.ts` / `web/src/types/index.ts`

- [ ] Підхопити нове поле `bucketsUsed` у `ScanResult` (без зміни ендпойнтів — `?deep=true`
  уже існує).

## Група C — Документація

- [ ] `docs/olx-api.md` §2.9 — підсекція «Розбиття по ціні»: бісекція, поріг 1000, probe макс.
  ціни (із позначкою результату live-верифікації сортування за ціною), глобальні запобіжники.
- [ ] `CLAUDE.md` (розділ «Метод збору даних» / «Глибокий скан») — згадати авто-розбиття й що
  coverage-вікно для split-скану не запускається.
- [ ] `docs/architecture.md` — оновити описи `graphqlOlxFetcher.ts` (fetchPage/fetchSearchSplit/
  probeMaxPrice) і `scanner.ts`.
- [ ] `docs/scan-mechanisms-explained.md` — додати блок про розбиття + виправити, що coverage
  пропускається саме для split (а звичайний/повний deep — запускає).
- [ ] `docs/structure.md` — якщо з'явиться новий файл; `docs/olx-monitor-spec.md` §4
  (ввічливість) / §13 (ризики) — згадати запобіжники split.

## Ризики / відкриті питання

- **Probe макс. ціни залежить від непідтвердженої підтримки сортування за ціною в OLX
  GraphQL.** Це **gating-крок**: спершу перевірити live одним запитом. Якщо не працює —
  для пошуків без `to` розбиття не вмикається (звичайний deep + UI-підказка «задайте верхню
  межу ціни для повного покриття»); результат верифікації записати в `docs/olx-api.md`.
- Лавина запитів: захист — `MAX_BUCKETS`, `MAX_TOTAL_REQUESTS`, збережені батч-паузи 3–6с
  (між бакетами теж пауза). Глибокий скан великого пошуку стане помітно довшим (кілька хвилин) —
  відобразити в оцінці часу й confirm-діалозі.
- Межі бакетів дублюють крайні оголошення (ціна рівно на межі) — дедуп по `olx_id` знімає.
- Точність `visible_total_count` на під-діапазонах: OLX може віддавати наближене число; поріг
  1000 з запасом до 1040 (вікна) це покриває, але якщо бакет усе одно впреться у вікно
  («window cap hit») — лишаємо частковим, без падіння (наявна логіка warning).

## Верифікація

- [ ] `npm run build` (server tsc + web tsc/vite) — без помилок.
- [ ] **Live probe-тест** макс. ціни (один запит) — зафіксувати, чи працює сортування за ціною;
  за результатом лишити probe або fallback.
- [ ] Глибокий скан «ipad 9 (1450–8000)»: формуються бакети (лог/`scan_runs`), `found` росте до
  ~`visible_total_count`, помилок немає, між батчами/бакетами є паузи 3–6с, прогрес-бар
  проходить «Підготовка…» → детермінований → завершення.
- [ ] Перевірити, що для split-скану **немає масових auto-disable** (coverage пропущено).
- [ ] Пошук ≤1000 результатів: deep працює як раніше (один діапазон, без розбиття).
- [ ] Пошук без `to`: або probe знайшов межу й розбив, або (fallback) звичайний deep + підказка.
- [ ] UI: оцінка часу/запитів і confirm-діалог відображають N діапазонів; toast показує
  `діапазонів N`.

## Коміт

Після реалізації — запропонувати текст коміту англійською (конвенція CLAUDE.md).
