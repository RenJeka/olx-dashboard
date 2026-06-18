# План: ручний «Глибокий скан» (Гібрид, варіант 3) + чесний лічильник результатів

> Прогрес: познач `[x]` коли пункт виконано. Легенда: `[ ]` — заплановано, `[~]` — у роботі, `[x]` — готово.
>
> **Для виконавця:** інваріанти, які не можна порушувати без узгодженої в цьому плані
> зміни, — у [`../../CLAUDE.md`](../../CLAUDE.md). Деталі GraphQL/HTML збору —
> [`../olx-api.md`](../olx-api.md). Нічого не вигадуй поза цими файлами й цим планом;
> якщо чогось бракує — зупинись і спитай.

## Context

Діагностовано: для пошуку «ipad 9 (1450–8000)» UI показує «Результатів: 1 258», а в
таблиці — лише 167 рядків. Причина — **не баг**: `GraphqlOlxFetcher` (і
`HtmlOlxFetcher`-fallback) обмежені `≤3 запити на скан` (`PAGE_LIMIT=40 × MAX_REQUESTS=3`
≈ 120–150 оголошень, перші ~3 сторінки видачі OLX). 167 у БД — це накопичення унікальних
`olx_id` за 12 сканів. `visible_total_count: 1258` — чесне число від OLX («скільки всього
є на сайті»), яке ми просто зберігаємо й показуємо, але ніколи не вигрібаємо повністю.

Обрано **варіант 3 (Гібрид)**, уточнений користувачем:

- **Без авто-логіки за історією сканів.** Замість «перший скан — глибокий» —
  **ручна кнопка «Глибокий скан»** в UI поруч зі звичайним «Сканувати». Користувач сам
  вирішує, для якого пошуку (новий чи вже існуючий, типу «ipad 9») і коли запустити
  одноразовий глибокий прохід.
- **Звичайний скан не змінюється**: `≤3 запити`, затримка 1–2 с — як зараз.
- **Глибокий скан**: пріоритет — отримати **якомога більше даних**, час не критичний,
  але без «DDoS» OLX. Стратегія — **батчі по 3 запити** (як звичайний скан), з паузою
  **3–6 с** між батчами, до цілі `min(50, ceil(visible_total_count / 40))` запитів
  (для «ipad 9»: `ceil(1258/40)=32` → 32 запити ≈ 11 батчів ≈ 1.5–2 хв). Рання зупинка,
  якщо сторінка повернула `< 40` елементів (видача вичерпана раніше цілі) — як і зараз.
  `50` — абсолютний запобіжник на випадок аномального `visible_total_count`.

**Це змінює інваріант ввічливості з `CLAUDE.md`** («≤3 запити на скан» → лишається для
звичайного скану; глибокий скан — окремий, ручний, документований режим). Зміна
узгоджена в плановій сесії.

Друга частина — **прибрати плутанину в UI**: замість «Результатів: 1 258» показувати
«Результатів на OLX: 1 258 · У базі: 167», щоб число OLX не виглядало як обіцянка
показати стільки ж рядків.

Третя частина — **прогрес-бар для глибокого скану**: оскільки глибокий скан може тривати
1.5–2 хв (батчі з паузами), користувач має бачити «запит X з Y» і скільки приблизно ще
чекати. Реалізація — через **поллінг**: `scan_runs` отримує колонки `requests_done`/
`requests_total`, які оновлюються після кожного запиту через `onProgress`-колбек у
`FetchOptions`; новий ендпойнт `GET /api/searches/:id/scan-status` віддає останній
`scan_runs` для пошуку; фронтенд поллить його раз на ~1.5 с, поки триває глибокий скан.
Це додає дві колонки до `scan_runs` (через існуючий `addColumnIfMissing` у `db.ts`).

---

## Група A — Backend: підтримка глибокого скану

### A1. Типи — `server/src/types.ts`

- [x] Додати `FetchOptions { deep?: boolean; onProgress?: (done: number, total: number) => void }`.
- [x] `OlxFetcher.fetchSearch(search: SearchConfig, options?: FetchOptions): Promise<FetchSearchResult>`.
- [x] `FetchSearchResult` — додати `requestsUsed: number` (скільки запитів реально зроблено).
- [x] `ScanResult` — додати `requestsUsed: number`.
- [x] Додати `ScanStatus { id: number; started_at: string; finished_at: string | null;
  found: number | null; new_count: number | null; error: string | null;
  requests_done: number | null; requests_total: number | null }` (рядок `scan_runs`
  для ендпойнту прогресу).

### A2. `server/src/scraper/graphqlOlxFetcher.ts`

- [x] Константи: перейменувати `MAX_REQUESTS` → `BATCH_SIZE = 3` (те саме значення,
  використовується і як ліміт звичайного скану, і як розмір батчу глибокого);
  додати `DEEP_SAFETY_CAP = 50`, `BATCH_PAUSE_MIN_MS = 3000`, `BATCH_PAUSE_MAX_MS = 6000`.
- [x] `fetchSearch(search, options)`:
  - звичайний (`!options?.deep`): як зараз, `target = BATCH_SIZE` (3).
  - глибокий (`options?.deep`): початково `target = DEEP_SAFETY_CAP`; після першої
    відповіді (`i === 0`), якщо `metadata.visible_total_count` присутній —
    `target = min(DEEP_SAFETY_CAP, ceil(visibleTotalCount / PAGE_LIMIT))`.
  - Пауза між запитами: якщо глибокий і `(i + 1) % BATCH_SIZE === 0` (кінець батчу) —
    рандомізована пауза `BATCH_PAUSE_MIN_MS..BATCH_PAUSE_MAX_MS`; інакше — звичайна
    `randomDelay()` (1–2 с), як зараз.
  - Рання зупинка: `items.length < PAGE_LIMIT` → `break` (без змін).
  - Після **кожного** запиту (включно з першим) викликати `options?.onProgress?.(i + 1, target)`
    (для глибокого — `target` після першої ітерації вже уточнений).
  - Повертати `requestsUsed` (фактична кількість виконаних ітерацій).

### A3. `server/src/scraper/olxFetcher.ts` (HTML fallback)

- [x] Той самий `options?: FetchOptions`. HTML-фетчер не має `visible_total_count`,
  тому для `deep` — просто `maxPages = DEEP_SAFETY_CAP` (`target = maxPages` одразу,
  без уточнення після першої сторінки), той самий батч-патерн (`BATCH_SIZE`/`BATCH_PAUSE_*`,
  ті самі значення що й у GraphQL-фетчері — винести в `selectors.ts` або продублювати
  локально, як зручніше). Рання зупинка вже є (`empty-state` / 0 карток / 0 нових).
- [x] Викликати `options?.onProgress?.(page, target)` після кожної сторінки.
- [x] Повертати `requestsUsed` (фактична кількість оброблених сторінок).

### A4. Схема БД — `server/src/db/schema.sql` + `db.ts`

- [x] `scan_runs`: додати колонки `requests_done INTEGER DEFAULT 0`,
  `requests_total INTEGER` — у `schema.sql` (для нових БД) і через `addColumnIfMissing`
  у `db.ts` (для існуючої `server/data/olx.db`).

### A5. `server/src/scanner.ts`

- [x] `runScan(searchId: number, options?: { deep?: boolean })`.
- [x] При створенні `scan_runs`-рядка — `requests_done = 0`, `requests_total = NULL`.
- [x] `onProgress(done, total)` колбек → `UPDATE scan_runs SET requests_done = ?,
  requests_total = ? WHERE id = ?` (synchronous better-sqlite3, безпечно викликати з
  середини `await`-циклу фетчера).
- [x] `fetchWithFallback(search, options)` — прокидає `options` (разом з `onProgress`)
  в обидва фетчери, повертає також `requestsUsed`.
- [x] Зібрати фінальний `ScanResult` як `{ ...upsertResult, requestsUsed }`.

### A6. Роути і CLI

- [x] `server/src/routes/searches.ts`: `POST /api/searches/:id/scan` — додати
  `Querystring: { deep?: string }`, `const deep = req.query.deep === 'true'`,
  `runScan(id, { deep })`.
- [x] `server/src/routes/searches.ts`: новий `GET /api/searches/:id/scan-status` →
  `SELECT id, started_at, finished_at, found, new_count, error, requests_done,
  requests_total FROM scan_runs WHERE search_id = ? ORDER BY id DESC LIMIT 1`
  (повертає `undefined`/404, якщо сканів ще не було).
- [x] `server/src/scan.ts`: підтримати прапорець `--deep` → `runScan(searchId, { deep: true })`,
  у вивід додати `requestsUsed`.

---

## Група B — Frontend: кнопка «Глибокий скан» + чесний лічильник

### B1. `web/src/types/index.ts` і `web/src/api/client.ts`

- [x] `ScanResult` — додати `requestsUsed: number`.
- [x] Додати `ScanStatus` (дзеркало серверного типу — поля з A1).
- [x] `useScan()`: `mutationFn` приймає `{ searchId: number; deep?: boolean }`, викликає
  `POST /api/searches/${searchId}/scan${deep ? '?deep=true' : ''}`.
- [x] Новий `useScanStatus(searchId: number | null, enabled: boolean)` —
  `useQuery({ queryKey: ['scan-status', searchId], queryFn: () => api<ScanStatus>(...),
  enabled: enabled && searchId != null, refetchInterval: 1500 })`.

### B2. `web/src/pages/Searches.tsx`

- [x] Стан заміни `scanningId` на `scanState: { id: number; deep: boolean } | null`.
- [x] Друга `IconButton` поруч з існуючою «Сканувати» (`LuRefreshCw`) — іконка `LuLayers`
  («Глибокий скан»), `Tooltip` з поясненням («Глибокий скан: більше сторінок з паузами,
  може зайняти 1–2 хв»). Обидві кнопки `disabled`, якщо для цього `id` вже триває будь-який
  скан; `loading` — окремо для normal/deep на основі `scanState`.
- [x] **Прогрес-бар**: коли `scanState?.deep && scanState.id === s.id` —
  `useScanStatus(s.id, true)` (поллінг); під рядком пошуку рендерити Chakra
  `Progress.Root` (+ `Progress.Track`/`Progress.Range`):
  - поки `requests_total == null` → індетермінований режим (без `value`), текст «Підготовка…»;
  - коли відомий → `value = (requests_done / requests_total) * 100`, текст
    «Запит {requests_done}/{requests_total}» + оцінка часу, що лишився:
    `~{Math.round((requests_total - requests_done) * 3)} с`
    (3 с/запит — середнє з урахуванням пауз між батчами, винести як коментар-константу).
  - Поллінг автоматично припиняється, коли `scanState` скидається в `null`
    (`onSettled` мутації `useScan`), бо `enabled` стає `false`.
- [x] Toast після глибокого скану: `Глибокий скан: ${r.requestsUsed} запитів, знайдено
  ${r.found}, нових ${r.new_count}` (звичайний скан — повідомлення без змін).

### B3. `web/src/App.tsx` — прибрати плутанину

- [x] Додати `const { data: listings } = useListings(selectedId);` (той самий query-ключ,
  що й у `ListingsTable` → без зайвого запиту, спільний кеш TanStack Query).
- [x] Замінити блок `{selectedSearch?.visible_total_count != null && ...}` на:
  - якщо `visible_total_count != null` → `Результатів на OLX: {X.toLocaleString('uk-UA')} · У базі: {(listings?.length ?? 0).toLocaleString('uk-UA')}`
  - інакше (ще не було GraphQL-скану) → лише `У базі: {(listings?.length ?? 0).toLocaleString('uk-UA')}`
  - нічого не показувати, якщо `selectedSearch` відсутній (пошук не вибрано).

---

## Група C — Документація

- [x] `CLAUDE.md` — секція «Метод збору даних»: уточнити, що `≤3 запити` — для
  **звичайного** скану; додати опис «Глибокий скан» (ручна кнопка, батчі по 3,
  пауза 3–6 с, ціль `min(50, ceil(visible_total_count/40))`, рання зупинка `<40`).
- [x] `docs/olx-api.md` §2.9 — нова підсекція «Глибокий скан (вручну)» з тими ж деталями
  + параметр `?deep=true` роута.
- [x] `docs/architecture.md` — «Сценарій сканування» (крок 3): згадати режим `deep`
  (`FetchOptions`, `onProgress`); таблиця модулів — оновити описи
  `graphqlOlxFetcher.ts`/`olxFetcher.ts`/`scanner.ts`/`searches.ts`/`types.ts`; додати
  `GET /api/searches/:id/scan-status` до опису `routes/searches.ts`.
- [x] `docs/olx-monitor-spec.md` §4 («Правила ввічливості»), §5 (схема — нові колонки
  `scan_runs.requests_done`/`requests_total`) і §13 (ризики) — те саме уточнення
  звичайний/глибокий + опис прогрес-полів.
- [x] `docs/plans/TODO` — пункт 13 («Розібратись чому результатів 1251...») позначити
  `[x]`, переформулювати: причина задокументована тут; замість «показувати всі» —
  чесний лічильник «На OLX / У базі» + ручний «Глибокий скан» для нарощування покриття.

---

## Верифікація

- [x] `npm run build` (server tsc + web tsc/vite) без помилок.
- [ ] Звичайний скан (`Сканувати`) — поведінка не змінилась: `≤3` запити, `found ≈ 145–150`.
- [ ] Глибокий скан на пошуку «ipad 9» — `requestsUsed` помітно більший за 3 (до ~32),
  `found` зростає, у `scan_runs` немає помилок; перевірити в логах/мережі, що між батчами
  справді є паузи 3–6 с.
- [ ] Прогрес-бар: під час глибокого скану «ipad 9» прогрес-бар і лічильник
  «Запит X/Y» оновлюються кожні ~1.5 с і доходять до `Y/Y`; після завершення —
  бар зникає, поллінг (`scan-status`) припиняється (перевірити в Network).
- [ ] UI: вибрати пошук «ipad 9» → у шапці «Результатів на OLX: 1 258 · У базі: <N>»,
  де `<N>` зростає після глибокого скану.
- [ ] Пошук без жодного GraphQL-скану (тільки HTML-fallback, `visible_total_count = null`)
  → у шапці лише «У базі: N», без помилок.
- [ ] CLI: `npm run scan -- --search <id> --deep`.

---

## Коміт

Після реалізації кожної групи — запропонувати текст коміту користувачу (англійською,
за конвенцією `CLAUDE.md`).
