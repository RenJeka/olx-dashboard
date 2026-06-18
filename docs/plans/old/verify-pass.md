# План: verify-прохід (A3) — перевірка живості старих оголошень + дозаповнення опису/продавця

> Прогрес: познач `[x]` коли пункт виконано. Легенда: `[ ]` — заплановано, `[~]` — у роботі, `[x]` — готово.
>
> **Для виконавця:** деталі OLX — у [`../olx-api.md`](../olx-api.md) (§3 — HTML, §3.4 — маркер
> неактивності); інваріанти — у [`../../CLAUDE.md`](../../CLAUDE.md). Нічого не вигадуй поза
> цими файлами; бракує інформації — зупинись і спитай.

## Context

Останній крок Етапу 2 (`stage-2-statuses-and-filters.md`, пункт A3). Зараз система лише
*здогадується* про зникнення оголошень через `miss_count` (вікно покриття), а ~176 рядків
«хвоста» за вікном пагінації GraphQL (`offset ≤ 1000`, див. `graphql-offset-window.md`)
ніколи не отримають опис/продавця зі сканів. Verify-прохід вирішує обидві задачі прямими
запитами на сторінки оголошень (`listings.url`).

**Маркер неактивної сторінки визначено live 2026-06-12** (4 проби з паузами 1.5 с):

- мертве оголошення → **HTTP 410 Gone** (перевірено на 2 реальних зниклих);
- неіснуючий URL → **HTTP 404**;
- живе → **HTTP 200**, у HTML присутній `[data-testid="ad_description"]`;
- текстові маркери НЕнадійні (фрази типу «неактивне» трапляються навіть у JS-бандлах живої
  сторінки) — детект ТІЛЬКИ за HTTP-кодом + наявністю `ad_description`;
- на живій detail-сторінці є опис (`[data-testid="ad_description"]`) і продавець
  (`[data-testid="user-profile-user-name"]`, для бізнес-продавців — `trader-title`);
  `__NEXT_DATA__`/JSON-LD на detail-сторінках НЕМАЄ (є `__PRERENDERED_STATE__`, але
  DOM-селектори простіші й уже частково в `selectors.ts`) — парсимо cheerio.

Рішення користувача (2026-06-12): **повний обсяг** — кандидати = давно не бачені + рядки
без опису; жива сторінка → оновити статус І дозаповнити опис/продавця.

Стан БД на момент планування: 0 кандидатів «не бачені > 3 днів» (усі скани свіжі),
176 рядків без `description`/`seller_name` (усі в search_id=3) — закриються за ~4 проходи
по 50 сторінок. `scan_runs.kind` без CHECK, коментар у `schema.sql` уже передбачає
`verify` — **схему БД не міняти**.

## Файли

- `server/src/scraper/verifier.ts` — **новий**: проба однієї сторінки (`probeListingPage`)
- `server/src/scraper/selectors.ts` — селектор продавця detail-сторінки
- `server/src/scanner.ts` — `runVerify()`: кандидати, батчі, оновлення БД, scan_runs
- `server/src/types.ts` — `VerifyResult`
- `server/src/routes/searches.ts` — `POST /api/searches/:id/verify`, лічильник кандидатів у `/stats`
- `server/src/scan.ts` — CLI-прапорець `--verify`
- `web/src/types/index.ts`, `web/src/api/client.ts` — DTO + хук `useVerify()`
- `web/src/components/SearchActionPanel.tsx` — активувати картку «Перевірити неактивні»
- `docs/olx-api.md` §3.4 + журнал §6, `CLAUDE.md`, `docs/architecture.md`,
  `docs/structure.md`, `docs/plans/stage-2-statuses-and-filters.md` (відмітка A3)

## Група A — Проба сторінки (`scraper/verifier.ts`)

- [x] **A1. Селектор продавця.** У `selectors.ts` додати
  `detailSellerName: '[data-testid="user-profile-user-name"]'` (поряд з наявними
  `detailParams`/`detailDescription`/`detailTrader`).
- [x] **A2. `probeListingPage`.** Новий `server/src/scraper/verifier.ts`:

  ```ts
  export type ProbeVerdict = 'alive' | 'dead' | 'unknown';
  export interface ProbeResult {
    verdict: ProbeVerdict;
    httpStatus: number | null;   // для note/логів
    description: string | null;  // лише при alive
    sellerName: string | null;   // лише при alive
  }
  export async function probeListingPage(url: string): Promise<ProbeResult>
  ```

  - `fetch(url, { headers: REQUEST_HEADERS, redirect: 'manual' })` — заголовки з `selectors.ts`;
  - **404 | 410 → `dead`**;
  - **200** → cheerio: є `detailDescription` → `alive`, витягти текст опису і продавця
    (`detailSellerName`, fallback `detailTrader`); немає `ad_description` → `unknown`
    (JS-only/невідомий лейаут — статус НЕ чіпати);
  - 3xx / інші коди / мережева помилка → `unknown` (помилка одного URL не валить прохід).

  > Реалізовано точно за планом: `selectors.ts` має
  > `detailSellerName: '[data-testid="user-profile-user-name"]'` поряд із
  > `detailParams`/`detailDescription`/`detailTrader`. `server/src/scraper/verifier.ts` →
  > `probeListingPage(url)`: `fetch(url, { headers: REQUEST_HEADERS, redirect: 'manual' })`;
  > 404/410 → `dead`; 200 + `[data-testid="ad_description"]` → `alive` (опис через cheerio
  > `.html()`, продавець з `detailSellerName`, fallback `detailTrader`); 200 без
  > `ad_description`, 3xx/інші коди чи мережева помилка → `unknown`.

## Група B — Оркестрація (`scanner.ts` → `runVerify`)

- [x] **B1. Кандидати** (разом ≤ `VERIFY_PAGE_CAP = 50`, два пріоритети):
  - **P1 (живість, спершу найдавніші):** `search_id = ? AND last_seen_at <
    datetime('now','-3 days') AND (status_source='auto' OR status='rejected')` — включно зі
    `status='disabled'` (auto) для реактивації; `ORDER BY last_seen_at ASC`.
  - **P2 (дозаповнення):** `search_id = ? AND description IS NULL AND status != 'disabled'`,
    ще не у P1; `ORDER BY posted_at DESC` (свіжі цінніші).
- [x] **B2. Батч-патерн** як у глибокого скану: 3 запити з паузою 1–2 с усередині батчу,
  3–6 с між батчами (ті самі значення констант, що у фетчерах).
- [x] **B3. Оновлення за вердиктом** (транзакція):
  - **dead** → якщо `status_source='auto' OR status='rejected'`: `status='disabled'`, до
    `note` дописати `auto-disabled: verify http=<410|404>` (патерн olx_status-disable).
    Manual-статуси НЕ чіпати (інваріант CLAUDE.md).
  - **alive** → `last_seen_at = now`, `miss_count = 0`; якщо було `disabled` +
    `status_source='auto'` → `status='new'` (auto-reactivate); **backfill**:
    `description`/`seller_name` записати, ЛИШЕ якщо в БД `NULL` (не перетирати
    GraphQL-дані HTML-парсингом).
  - **unknown** → нічого не міняти; порахувати в підсумок.
- [x] **B4. Журнал.** `INSERT scan_runs (kind='verify')`; прогрес
  `requests_done/requests_total` через той самий механізм, що onProgress скану; підсумок:
  `found` = перевірено сторінок, `new_count` = реактивовано, `disabled_count` =
  задизейблено; `error` = зведення unknown/мережевих проблем (або NULL).
- [x] **B5. Типи.** `types.ts`:
  `VerifyResult { checked, alive, dead, unknown, reactivated, disabled_count, backfilled }`.

  > Реалізовано точно за планом у `scanner.ts`: `loadVerifyCandidates(searchId, cap)`
  > об'єднує `P1_CONDITION`/`P2_CONDITION` до `VERIFY_PAGE_CAP = 50`
  > (`VerifyCandidateRow`); батч-константи `VERIFY_BATCH_SIZE = 3`,
  > `VERIFY_MIN/MAX_DELAY_MS = 1000/2000`, `VERIFY_BATCH_PAUSE_MIN/MAX_MS = 3000/6000`
  > (як у deep scan). За вердиктом: `updateDeadStmt` — dead + (`auto`|`rejected`) →
  > `status='disabled'`, `appendVerifyNote()` ідемпотентно дописує
  > `auto-disabled: verify http=<410|404>`; `updateAliveStmt` — `alive` →
  > `last_seen_at=now`, `miss_count=0`, auto-reactivate `disabled→new` (лише `auto`),
  > COALESCE-backfill `description`/`seller_name` (лише якщо `NULL`); `unknown` —
  > без змін БД, лише підсумок. `runVerify(searchId)` пише `scan_runs(kind='verify')`
  > з прогресом (`onProgress`) і підсумком `found/new_count/disabled_count/error`.
  > `VerifyResult` у `types.ts` — точно за описаною формою.

## Група C — API + CLI

- [x] **C1. Роут.** `routes/searches.ts`: `POST /api/searches/:id/verify` → `runVerify(id)`
  (патерн POST /scan: 404 на невідомий пошук, помилки → 500 з текстом).
  `GET /scan-status` уже віддає останній `scan_runs` будь-якого kind — поллінг без змін.
- [x] **C2. Stats.** У `/api/searches/:id/stats` додати `verify_candidates` (загальна
  кількість P1+P2); узгодити з наявним `stale_count` (якщо дублює P1 — замінити/уточнити).
- [x] **C3. CLI.** `scan.ts`: прапорець `--verify` (взаємовиключний із `--deep`) →
  `runVerify`.

  > Реалізовано: `POST /api/searches/:id/verify` → `runVerify(id)` (404 на невідомий
  > `searchId`, помилки виконання → 500 з текстом — патерн `POST /scan`); `GET
  > /scan-status` без змін (вже повертає останній `scan_runs` будь-якого `kind`). `/stats`
  > повертає `verify_candidates` — `countVerifyCandidates(searchId)` (той самий SQL,
  > що `loadVerifyCandidates`, без `LIMIT`). `scan.ts` CLI — прапорець `--verify`,
  > взаємовиключний з `--deep`.

## Група D — Фронтенд

- [x] **D1. API-клієнт.** `web/src/types/index.ts` + `api/client.ts`: DTO `VerifyResult`,
  поле `verify_candidates` у `SearchStats`, хук `useVerify()` (мутація POST `/verify`,
  інвалідація `listings` + `search-stats`, патерн `useScan`).
- [x] **D2. Картка.** `SearchActionPanel.tsx`: активувати «Перевірити неактивні» (прибрати
  `opacity/cursor-not-allowed` і тултіп-заглушку): лічильник з `stats.verify_candidates`,
  onClick → `useVerify`, прогрес через наявний `useScanStatus`
  (`SCAN_KIND_LABELS.verify` уже існує); кнопка disabled, коли кандидатів 0; текст:
  «Перевіряє сторінки давно не бачених оголошень і дозаповнює опис/продавця
  (до 50 сторінок за прохід)»; тост-підсумок (реактивовано/вимкнено/дозаповнено).

  > Реалізовано: `VerifyResult` і `SearchStats.verify_candidates` у
  > `web/src/types/index.ts`; `useVerify()` у `client.ts` — `POST /verify`, інвалідація
  > `['listings', searchId]` і `['search-stats', searchId]` (патерн `useScan()`). У
  > `SearchActionPanel.tsx` картка «Перевірити неактивні (N)» активна: `N =
  > stats.verify_candidates`, `disabled` лише коли триває скан або `N === 0`,
  > onClick → `runVerifyPass()` (`useVerify().mutate`), прогрес — `useScanStatus`/
  > `scanKind='verify'` (`SCAN_KIND_LABELS.verify` вже існував). Тост-підсумок:
  > «Перевірено N · живих N · мертвих N · реактивовано N · вимкнено N · дозаповнено N».

## Група E — Документація

- [x] **E1.** `docs/olx-api.md` §3.4: маркер неактивності (410/404/200+`ad_description`,
  селектор продавця; верифіковано live 2026-06-12, текстові маркери ненадійні); рядок у
  журнал §6.
- [x] **E2.** `CLAUDE.md`: verify-прохід — реалізовано (прибрати «ще НЕ реалізовано» і
  «СТОП і питання користувачу»; коротко: маркер = HTTP 410/404, кандидати P1+P2, кап 50).
- [x] **E3.** `docs/architecture.md` (модуль `verifier.ts`, `runVerify`, новий ендпойнт,
  потік) + `docs/structure.md` (нові файли/рядки таблиці «куди дивитись») + відмітка A3 у
  `docs/plans/stage-2-statuses-and-filters.md`.

  > Реалізовано: `docs/olx-api.md` §3.4 заповнено фактичним маркером (410/404 →
  > `dead`, 200 + `ad_description` → `alive`, селектори опису/продавця) + новий рядок
  > у журналі §6 (2026-06-12). `CLAUDE.md` — verify-прохід позначено реалізованим
  > (P1/P2-кандидати, batch-патерн, verdict→дія, посилання на `verifier.ts`/`runVerify`),
  > прибрано «ще НЕ реалізовано»/«СТОП і питання». `docs/architecture.md` —
  > verify-сценарій, модулі `verifier.ts`/`scanner.ts` (`runVerify`), ендпойнт
  > `POST /verify`, `/stats.verify_candidates`, фронтенд (`useVerify`,
  > `SearchActionPanel`). `docs/structure.md` — `verifier.ts` у дереві + рядок
  > «куди дивитись». A3 у `docs/plans/stage-2-statuses-and-filters.md` позначено
  > `[x]` з описом фактичної реалізації.

## Test-cases (виконує користувач)

1. **Кнопка активна:** «Перевірити неактивні (N)» для пошуку 3, N ≈ 176; запуск →
   прогрес-бар до N≤50; toast із підсумком.
2. **Дозаповнення:** після проходу рядки «хвоста» отримали опис/продавця; повторний прохід
   бере наступні 50 рядків без опису (за ~4 проходи `description IS NULL` → ~0).
3. **Журнал:** у `scan_runs` рядок `kind='verify'` з `found`/`new_count`/`disabled_count`
   і прогресом `requests_done/requests_total`.
4. **Мертве оголошення:** якщо трапиться 410 → `status='disabled'`, у note —
   `auto-disabled: verify http=410`; manual-статуси (interested/contacted) не змінюються.
5. **CLI:** `npm run scan -- --search 3 --verify` → підсумок у консолі, той самий ефект,
   що й кнопка.
6. **Регресія:** звичайний і глибокий скани працюють без змін.
