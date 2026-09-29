# План: Деталізований прогрес сканування (всі види — normal/deep/verify/синоніми)

## Контекст

Раніше під час скану користувач бачив лише плаский "Запит N/M" + тонкий індетермінований
прогрес-бар. Це приховувало реальну структуру роботи: глибокий скан ділиться на цінові бакети
(`fetchSearchSplit`), мульти-query скан (синоніми) йде по черзі через кожен варіант запиту з
паузами, verify-прохід має дві семантично різні фази (P1 — живість давно не бачених, P2 —
дозаповнення опису). Ці дані вже існували **в пам'яті** під час виконання (`vi`,
`variants.length`, `bi`, `buckets.length`, межа P1/P2), але не писались у `scan_runs` і не
доходили до UI. Мета: показати користувачу максимум реальної інформації про те, що зараз
відбувається і скільки лишилось.

Існував і баг: `GET /scan-status` не вибирав `fetch_method` (хоча колонка існує і пишеться),
тож бейдж методу (`GraphQL`/`HTML`) у `SearchActionPanel.tsx` ніколи не рендерився.

## Дизайн (за принципами скіла frontend-design)

Signature-елемент — **сегментована "смуга подорожі"**: горизонтальний ряд маленьких
прямокутників, де **один сегмент = одна реальна підодиниця роботи** (варіант синоніма / ціновий
бакет / фаза verify P1↔P2) — структурний, не декоративний прийом. Поточний сегмент — м'яка
пульсація (з урахуванням `prefers-reduced-motion`), завершені — суцільний `colorPalette.solid`,
очікувані — `bg.muted`/`border.subtle`. Кольори — лише існуючі semantic tokens теми.

Над смугою — рядок тексту поточного етапу (напр. «Синонім «велобіг» (2/4) · Бакет ·
₴500–₴1200 · стор. 2/5», «Пауза ~4с», «Перевірка живості · #123456789 · живих 12 · мертвих 3»).
Під смугою — наявний загальний `Progress.Root` (запити done/total) + ETA — механіка без змін.

Якщо підпослідовність задовга для читабельних сегментів (>16) — деградація до тонкого
`Progress.Root` з числовим підписом замість сегментів. Без тултіпів на сегментах.

## Файли

**Створити:** `web/src/components/ScanProgressPanel.tsx`.
**Змінити:** `server/src/db/schema.sql`, `server/src/db/db.ts`, `server/src/types.ts`,
`server/src/scanner.ts`, `server/src/scraper/graphqlOlxFetcher.ts`,
`server/src/scraper/olxFetcher.ts`, `server/src/routes/searches.ts`, `web/src/types/index.ts`,
`web/src/components/SearchActionPanel.tsx`.

## Кроки

### A. Схема БД
- [x] `server/src/db/schema.sql`: додати у `CREATE TABLE scan_runs` колонки `stage TEXT,
  sub_done INTEGER, sub_total INTEGER`.
- [x] `server/src/db/db.ts`: 3 `addColumnIfMissing('scan_runs', 'stage'|'sub_done'|'sub_total', …)`.

### B. Типи
- [x] `server/src/types.ts`: новий `ScanProgress` ({done, total?, method?, stage?, subDone?,
  subTotal?}); `FetchOptions.onProgress?: (progress: ScanProgress) => void`.
- [x] `server/src/types.ts` `ScanStatus`: додати `kind`, `stage`, `sub_done`, `sub_total`.
- [x] `web/src/types/index.ts` `ScanStatus`: те саме.

### C. Backend — фетчери (`graphqlOlxFetcher.ts`, `olxFetcher.ts`)
- [x] `fetchSearch` (graphqlOlxFetcher.ts) → об'єктна форма onProgress, без stage.
- [x] `fetchSearchSplit`: root probe → stage «Зондування видачі»; перед `probeMaxPrice` → stage
  «Зондування максимальної ціни»; бісекційний цикл → stage «Розбиття діапазону (знайдено N)»;
  основна пагінація листків → stage з ціновим діапазоном бакета + сторінкою, `subDone=bi+1,
  subTotal=buckets.length`; перед паузами (в пагінації і між бакетами) → stage «Пауза ~Nс» (без
  subDone/subTotal — COALESCE на бекенді збереже позицію).
- [x] `olxFetcher.ts` (HTML fallback) → об'єктна форма, без stage.

### D. Backend — `scanner.ts`
- [x] `fetchWithFallback`: обгортки onProgress зберігають stage/subDone/subTotal внутрішнього
  шару, додають лише `method`.
- [x] `fetchAllQueries`: `onVariantProgress` композує «Синонім «X» (i/N) · {innerStage}»,
  `subDone=vi+1, subTotal=variants.length`; пауза між варіантами → stage «Пауза між синонімами».
- [x] `runScan` writer: один prepared UPDATE з `COALESCE` для `requests_total`/`fetch_method`/
  `sub_done`/`sub_total` (stage завжди перезаписується). Фінальні UPDATE (успіх/помилка) — додано
  очищення `stage=NULL, sub_done=NULL, sub_total=NULL`.
- [x] `loadVerifyCandidates`: повертає `{candidates, p1Count}` замість плаского масиву.
- [x] `runVerify`: у циклі — той самий UPDATE requests_done розширено до `stage` (фаза живість/
  опис + лічильники живих/мертвих) і `sub_done/sub_total=(1|2, 2)` лише якщо обидві фази мають
  кандидатів.

### E. Backend — роут
- [x] `server/src/routes/searches.ts` `GET /scan-status`: розширено SELECT —
  `fetch_method, kind, stage, sub_done, sub_total`.

### F. Frontend
- [x] `SearchActionPanel.tsx`: експортовано `SCAN_KIND_LABELS`; замінено блок прогресу на
  `<ScanProgressPanel scanKind={scanKind} status={status} secondsPerRequest=
  {DEEP_SCAN_SECONDS_PER_REQUEST} />`.
- [x] Новий `ScanProgressPanel.tsx`: заголовок (kind + method badge) → stage-рядок (якщо є) →
  сегментована смуга (якщо sub_total>1, fallback на тонкий бар при sub_total>16, з
  `prefers-reduced-motion` через `_motionReduce`) → існуючий requests-бар+ETA без зміни механіки.

### G. Перевірка
- [x] `npm run build` (server+web) — без помилок.
- [ ] Звичайний скан (1 query) — вигляд як раніше, бейдж методу видимий.
- [ ] Глибокий скан малого пошуку — без сегментів (1 бакет).
- [ ] Глибокий скан великого пошуку (split) — «Зондування…», потім сегменти по бакетах.
- [ ] Скан з 2+ синонімами — сегменти по варіантах.
- [ ] Verify з кандидатами в обох фазах — 2 сегменти, live-лічильники.
- [ ] `prefers-reduced-motion: reduce` — пульсація вимкнена.
- [ ] >16 підодиниць — деградація до тонкого бару.

## Доповнення — стабільний `requests_total` + згортання скану в хедер (2026-06-20)

Виправлено два UX-баги глибокого скану:

- **Лічильник «103/3» (`requests_total` стрибав униз і ставав меншим за `requests_done`).**
  Корінь — мульти-query агрегатори прогресу: у `runDeepScanFromPlan` (`server/src/scanner.ts`)
  `onVariantProgress` зміщував `done` на кумулятивний `requestsUsed`, але `total` віддавав без
  зміщення (оцінку лише поточного варіанта). Тепер total рахується **наперед** на весь скан
  (`estimateRunRequests(plan)` по кожному кешованому `SplitPlan` → `plannedTotal`), емітиться
  одразу (`stage: 'Підготовка…'`) і клампиться `Math.max(plannedTotal, done)` — стабільний і
  ніколи не менший за `done`. Аналогічно у `fetchAllQueries` (прямий «Глибокий скан» із
  синонімами) total зроблено монотонно-незменшуваним через `maxTotal = Math.max(maxTotal,
  totalOffset + p.total, done)`. Single-query split не змінювався (`scanBuckets.totalEstimate`
  уже стабільний).
- **Скан легко «загубити».** Новий `web/src/components/searches/action-panel/ScanStatusChip.tsx`
  — компактний клікабельний індикатор у хедері, що з'являється, коли скан іде, а модалку
  згорнуто (`isScanning && !dialogOpen`), і повертає модалку (`setDialogOpen(true)`) з тим самим
  прогресом. Підняття стану не потрібне — рендериться всередині `SearchActionPanel`.
