# План: виправлення вікна покриття — хибні масові auto-disable

> Прогрес: познач `[x]` коли пункт виконано. Легенда: `[ ]` — заплановано, `[~]` — у роботі, `[x]` — готово.
>
> **Для виконавця:** деталі OLX — у [`../olx-api.md`](../olx-api.md) §2; інваріанти — у
> [`../../CLAUDE.md`](../../CLAUDE.md) (цей план їх ЗМІНЮЄ — секція «Вікно покриття»).
> Нічого не вигадуй поза цими файлами; бракує інформації — зупинись і спитай.

## Context — що зламалося (діагностовано 2026-06-12)

Після серії сканів 395 живих оголошень отримали `status='disabled'` через вікно покриття
(`statusEngine.ts`), хоча на OLX вони активні. Журнал: скан №16 (normal) вимкнув 193,
№18 (normal, found=143) — **725**, №20 (deep, частковий — «window cap hit») — 138.
Серед вимкнених — оголошення з `posted_at` від 2022 року, що неможливо покрити сканом
у 143 рядки.

**Три причини (підтверджено live-пробами GraphQL 2026-06-12):**

1. **Запити не передають сортування.** `buildSearchParameters` (`graphqlOlxFetcher.ts`)
   не має ключа сортування → OLX віддає видачу за релевантністю (НЕ за датою).
2. **Вісь дат неправильна.** Навіть з сортуванням `sort_by=created_at:desc` OLX сортує за
   **`last_refresh_time`** (дата підняття/оновлення), а не `created_time`: «підняті» старі
   оголошення йдуть угорі видачі. `windowFloor = min(posted_at)` (= `created_time`) від
   одного «піднятого» оголошення 2022 року розтягує вікно на роки → майже вся база стає
   кандидатами на `miss_count += 1` → масовий disable за 2 скани.
3. **Частковий глибокий скан** (вперся у вікно пагінації `offset ≤ 1000`, warning у
   `scan_runs.error`) все одно запускає `applyScanStatuses` — з неповним покриттям.

**Live-проба сортування (2026-06-12, 3 запити):**

- без ключа сортування → порядок релевантності (дати хаотичні);
- `{key: "order", value: "created_at:desc"}` → **ігнорується** (видача ідентична default);
- `{key: "sort_by", value: "created_at:desc"}` → **працює**: видача за
  `last_refresh_time DESC` (перші 2–3 позиції — промо поза порядком, далі строгий спуск).

## Рішення

Вікно покриття переводиться на вісь **`last_refresh_time`** (єдина вісь, за якою OLX
реально сортує видачу) + сортування запитів фіксується явно + часткові скани не судять
про зникнення. Хибно вимкнені відновлюються одноразовим скриптом; кожен майбутній
coverage-disable отримує пояснення в `note` (прозорість для користувача).

«Хвіст» бази (рядки за вікном пагінації, `last_refresh_at IS NULL` після міграції) у
кандидати вікна покриття більше не потрапляє ніколи — його живість перевіряє verify-прохід
(прямі проби сторінок, надійний маркер HTTP 410/404).

## Файли

- `server/src/db/schema.sql` + `server/src/db/db.ts` — нова колонка `listings.last_refresh_at`
- `server/src/scraper/graphqlOlxFetcher.ts` — `sort_by=created_at:desc` у `searchParameters`
- `server/src/scraper/normalizer.ts` — зберігати `last_refresh_at` при upsert
- `server/src/scraper/statusEngine.ts` — вікно по `last_refresh_at`, note-маркер при disable
- `server/src/scanner.ts` — не запускати `applyScanStatuses` для часткових сканів
- одноразовий SQL-скрипт відновлення (виконується вручну, не комітиться)
- `CLAUDE.md`, `docs/olx-api.md` §2 + журнал §6, `docs/architecture.md`

## Група A — Збір: сортування + збереження refresh-дати

- [x] **A1. Сортування.** `buildSearchParameters`: додати
  `{ key: 'sort_by', value: 'created_at:desc' }` до базових параметрів (verified live
  2026-06-12 — дає порядок `last_refresh_time DESC`).
- [x] **A2. Колонка.** `schema.sql`: `last_refresh_at TEXT` у `listings` (коментар: ISO-дата
  останнього підняття з GraphQL `last_refresh_time`; вісь вікна покриття). `db.ts`:
  `addColumnIfMissing('listings', 'last_refresh_at', 'TEXT')`.
- [x] **A3. Upsert.** `normalizer.ts`: писати `last_refresh_at` з `item.lastRefreshAt`
  (лише GraphQL; на update — `CASE WHEN @is_graphql = 1` як у `posted_at`, щоб
  HTML-fallback не затирав значення NULL-ом).

## Група B — Вікно покриття на осі refresh

- [x] **B1. windowFloor.** `statusEngine.ts`: `windowFloor = lastRefreshAt` **останнього**
  елемента `fetched` (видача відсортована refresh DESC — низ останньої сторінки = межа
  покриття; `min()` НЕ використовувати — промо-вкраплення можуть розтягнути вікно).
  `exhausted` → `null` (вся видача, як раніше). Якщо `fetched` порожній або останній
  елемент без `lastRefreshAt` (не-GraphQL дані) → **пропустити прохід** (без осі немає
  вердиктів), повернути `{disabled_count: 0}`.
- [x] **B2. Кандидати.** Замість `posted_at >= windowFloor` →
  `last_refresh_at >= windowFloor` (рядки з `last_refresh_at IS NULL` — старі/хвіст —
  у кандидати не потрапляють: SQL NULL-семантика, як було з `posted_at`).
- [x] **B3. Note-маркер.** При coverage-disable дописувати в `note` ідемпотентно (патерн
  `olx_status`-disable з `normalizer.ts`): `auto-disabled: coverage miss_count=2` —
  кожен вимкнений рядок видно і зрозуміло в колонці «Нотатка».
- [x] **B4. Часткові скани.** `scanner.ts`: `fetchWithFallback` повертає `warning` окремим
  полем; `applyScanStatuses` викликається лише якщо `usedGraphql && warning == null`
  (частковий deep-скан «window cap hit» більше не вимикає нічого).

## Група C — Відновлення хибно вимкнених (одноразово, вручну)

- [x] **C1. Скрипт відновлення.** Для рядків `status='disabled'` БЕЗ маркера
  `auto-disabled` у `note` (= вимкнені вікном покриття, інші джерела маркер пишуть):
  - `status_source='manual'` (це були ручні `rejected`) → `status='rejected'`;
  - `status_source='auto'` → `status='new'`;
  - усім: `miss_count=0`. Вивести кількість відновлених по пошуках.
- [x] **C2. Контроль.** Після відновлення: `SELECT status, count(*)` по пошуках; справжніх
  мертвих потім відсіє verify-прохід (кнопка «Перевірити неактивні») — він перевіряє
  сторінки напряму (HTTP 410/404), на вікно покриття не спирається.

## Група D — Документація

- [x] **D1.** `docs/olx-api.md` §2: ключ `sort_by=created_at:desc` (працює; `order` —
  ігнорується; сортування фактично за `last_refresh_time DESC`, промо поза порядком) +
  рядок у журнал §6.
- [x] **D2.** `CLAUDE.md`: інваріант «Auto-disable — вікно покриття» переписати: вісь —
  `last_refresh_at`, `windowFloor` = refresh останнього отриманого, скани передають
  `sort_by=created_at:desc`, часткові скани (warning) auto-disable НЕ запускають,
  note-маркер `auto-disabled: coverage miss_count=2`.
- [x] **D3.** `docs/architecture.md`: оновити опис statusEngine/потоку скану;
  `docs/structure.md` — без змін структури (нових файлів немає), перевірити коментарі.

## Test-cases (виконує користувач)

1. **Швидкий скан не вимикає старе:** запустити швидкий скан двічі поспіль на пошуку 3 →
   `disabled_count` у тості ~0 (немає масових вимкнень), глибокі рядки бази лишаються
   у своїх статусах.
2. **Прозорість:** якщо щось вимкнулося — у колонці «Нотатка» цього рядка видно причину
   (`auto-disabled: coverage miss_count=2` / `olx_status=...` / `verify http=...`).
3. **Частковий deep:** глибокий скан, що впирається у вікно пагінації (warning у журналі),
   не змінює статуси (`disabled_count=0`).
4. **Відновлення:** хибно вимкнені (395) повернулися: auto → `new`, ручні rejected →
   `rejected`; лічильник «У базі» в панелі дій не змінився.
5. **Verify відсіює мертвих:** «Перевірити неактивні» на пошуку 3 → реально зниклі
   отримують `auto-disabled: verify http=410` у note.
6. **Регресія:** новий скан після міграції заповнює `last_refresh_at` для знайдених рядків
   (перевірити в БД: `SELECT count(*) FROM listings WHERE last_refresh_at IS NOT NULL`).
