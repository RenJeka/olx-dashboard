# План: вікно пагінації GraphQL (offset ≤ 1000), частковий успіх скану, нормалізація дат HTML-fallback

> Прогрес: познач `[x]` коли пункт виконано. Легенда: `[ ]` — заплановано, `[~]` — у роботі, `[x]` — готово.
>
> **Для виконавця:** деталі GraphQL — у [`../olx-api.md`](../olx-api.md) §2; інваріанти —
> у [`../../CLAUDE.md`](../../CLAUDE.md). Нічого не вигадуй поза цими файлами; бракує
> інформації — зупинись і спитай.

## Context

Верифіковано живими запитами (2026-06-12, пошук «ipad 9», `visible_total_count≈1242`):
- `offset=960` і `offset=1000` → `ListingSuccess`, по 40 елементів;
- `offset=1040` і глибше → `ListingError code=400 "Data validation error occurred"`.

Тобто GraphQL віддає максимум ~1040 перших оголошень видачі (останній валідний `offset` — 1000).
Це узгоджується з обрізанням `metadata.total_elements` до 1000 (`docs/olx-api.md` §2.9).

Наслідки в поточному коді:
1. **Глибокий скан падає за межею вікна.** `GraphqlOlxFetcher.fetchSearch` цілить
   `min(50, ceil(visible_total_count/40))` запитів; для «ipad 9» це 32 → запит з
   `offset=1040` отримує 400.
2. **Зібране викидається.** `ListingError` посеред скану кидає виняток
   (`graphqlOlxFetcher.ts:232-238`) — усі ~1040 уже отриманих оголошень втрачаються,
   `scanner.ts` робить повний HTML-fallback.
3. **HTML-fallback зберігає «бідні» рядки.** Сторінка списку не має опису/продавця/ISO-дат
   → у БД 911/1184 рядків з `description IS NULL`, `seller_name IS NULL` і текстовим
   `posted_at` («30 травня 2026 р.», «Сьогодні о 14:30»).
4. **Текстовий `posted_at` ламає вікно покриття.** `statusEngine.ts` порівнює
   `posted_at >= windowFloor` як рядки; «30 травня…» лексикографічно більший за «2026-…»
   → такі рядки завжди «в вікні» → 2 успішні GraphQL-скани хибно auto-disable'нуть їх усі.

Чесне обмеження: оголошення за межею вікна (позиції >1040 у видачі) GraphQL не віддає
ніколи — їхні опис/продавець лишаться порожніми до verify-проходу (A3 Етапу 2) або
деталь-фетчу (поза скоупом цього плану).

## Файли

- `server/src/scraper/graphqlOlxFetcher.ts` — кап цілі, частковий успіх
- `server/src/scraper/dateParser.ts` — **новий**: парсер дат HTML-fallback
- `server/src/scraper/normalizer.ts` — використати парсер для `posted_at`
- `server/src/scraper/statusEngine.ts` — коментар про гарантію формату `posted_at`
- `server/src/types.ts` — `FetchSearchResult.warning`
- `server/src/scanner.ts` — об'єднання `warning` у `scan_runs.error`
- `server/src/migratePostedAt.ts` — **новий**: одноразова міграція наявних рядків
- `server/package.json` + кореневий `package.json` — npm-скрипт міграції
- `docs/olx-api.md`, `CLAUDE.md`, `docs/architecture.md`, `docs/structure.md` — документація

## Група A — Вікно пагінації GraphQL (`graphqlOlxFetcher.ts`)

- [x] **A1. Кап цілі глибокого скану.** Константа `MAX_OFFSET = 1000` →
  `MAX_PAGES = MAX_OFFSET / PAGE_LIMIT + 1` (= 26). У `fetchSearch`:
  `target = Math.min(target, MAX_PAGES)` — і для початкового `DEEP_SAFETY_CAP`, і після
  уточнення за `visible_total_count`. Коментар із датою верифікації ліміту (2026-06-12).
- [x] **A2. Частковий успіх.** `ListingError` на запиті з `offset > 0`, коли вже є зібрані
  оголошення (`all.length > 0`), — НЕ кидати виняток: перервати цикл і повернути
  накопичене. `exhausted` лишити `false` (видача НЕ вичерпана — ми вперлися в ліміт API,
  далі оголошення є, але недоступні; `windowFloor` рахується із зібраного, не стає `null`).
  `ListingError` на першому запиті (`offset=0`) або коли `all.length === 0` — кидати як
  зараз (це справжня поломка → HTML-fallback).
- [x] **A3. Слід у scan_runs.** Розширити `FetchSearchResult` (`server/src/types.ts`)
  опційним полем `warning?: string`; при спрацюванні A2 записати туди
  `graphql window cap hit at offset=<N>`. У `scanner.ts` при успіху писати `warning` у
  `scan_runs.error` (той самий механізм, що `fallbackNote`; якщо обидва присутні —
  об'єднати через `; `).

## Група B — Нормалізація дат HTML-fallback

- [x] **B1. Парсер** `server/src/scraper/dateParser.ts`:
  `export function parseOlxDate(raw: string | null | undefined, now?: Date): string | null`:
  - `«Сьогодні о HH:MM»` → `YYYY-MM-DDTHH:MM:00` (сьогоднішня дата від `now`, дефолт —
    поточна);
  - `«Вчора о HH:MM»` → те саме мінус 1 день;
  - `«D <місяць_род> YYYY р.»` (`30 травня 2026 р.`) → `YYYY-MM-DD` (словник 12 родових
    форм: січня…грудня);
  - нерозпізнане → `null`. Без нових залежностей (без dayjs) — формати скінченні й прості.
- [x] **B2. Normalizer.** У гілці HTML-fallback (`normalizer.ts`, `else`-гілка
  `hasStructuredData`) `postedAt = parseOlxDate(parsedLocation.postedAt)` — у БД ідуть
  лише ISO або `NULL`. UPDATE-гілку не чіпати (`posted_at` при `is_graphql=0` і так не
  оновлюється).
- [x] **B3. Міграція наявних рядків** `server/src/migratePostedAt.ts`
  (запуск: `npm run migrate:posted-at`, патерн CLI — як `server/src/scan.ts`):
  - вибрати `listings`, де
    `posted_at IS NOT NULL AND posted_at NOT GLOB '[0-9][0-9][0-9][0-9]-*'`;
  - кожен прогнати через `parseOlxDate` (без `now` — «Сьогодні/Вчора» у старих рядках вже
    неточні; розпарсилось → записати, ні → `NULL`);
  - вивести підсумок: скільки конвертовано / занулено; транзакція.
  - Додати скрипти `"migrate:posted-at": "tsx src/migratePostedAt.ts"` у
    `server/package.json` і `"migrate:posted-at": "npm -w server run migrate:posted-at"`
    у кореневий `package.json`.
- [x] **B4. statusEngine — без змін коду.** Після B1–B3 `posted_at` завжди ISO або `NULL`;
  `NULL >= windowFloor` у SQLite дає `NULL` → рядок не потрапляє в кандидати вікна
  (безпечно: без дати — без auto-disable через вікно). Зафіксувати це коментарем у
  `statusEngine.ts` біля запитів кандидатів.

## Група C — Документація

- [x] **C1.** `docs/olx-api.md` §2.9: задокументувати ліміт `offset ≤ 1000` (верифіковано
  2026-06-12: 1000 OK, 1040 → 400 «Data validation error occurred»); ціль глибокого скану
  → `min(26, ceil(visible_total_count / 40))`; запис у журнал §6.
- [x] **C2.** `CLAUDE.md`: у розділі «Глибокий скан» ціль → `min(26, ceil(visible_total_count
  / 40))` (26 = межа вікна пагінації OLX, верифіковано 2026-06-12); прибрати/уточнити
  «50 — абсолютний запобіжник» (DEEP_SAFETY_CAP лишається як стартова оцінка до 1-го
  запиту, але кап тепер 26).
- [x] **C3.** `docs/architecture.md` + `docs/structure.md`: нові файли `dateParser.ts`,
  `migratePostedAt.ts`, npm-скрипт `migrate:posted-at`. Також оновлено
  `web/src/components/SearchActionPanel.tsx`: `DEEP_SCAN_SAFETY_CAP` (50) →
  `DEEP_SCAN_MAX_PAGES` (26) для узгодженості оцінки UI з реальним капом backend.

## Test-cases (виконує користувач)

1. **Глибокий скан «ipad 9»:** завершується без `graphql failed` у `scan_runs.error`;
   `requests_total ≤ 26`; нові/оновлені оголошення перших ~1040 позицій мають опис і
   продавця.
2. **Дозаповнення БД:** після глибокого скану кількість `description IS NULL` помітно
   падає (було 911); хвіст за вікном (~150–200 рядків) лишається порожнім — очікувано.
3. **Міграція:** після `npm run migrate:posted-at` запит
   `SELECT COUNT(*) FROM listings WHERE posted_at IS NOT NULL AND posted_at NOT GLOB
   '[0-9][0-9][0-9][0-9]-*'` → 0; у виводі скрипта — кількість конвертованих/занулених.
4. **Парсер дат:** «Сьогодні о 14:30» → сьогоднішня ISO-дата з часом; «Вчора о 09:15» →
   вчорашня; «30 травня 2026 р.» → `2026-05-30`; «Договірна» → `null`.
5. **Вікно покриття після фіксу:** два звичайні скани поспіль → `disabled_count` не
   вибухає (немає масового disable рядків з колишніми текстовими датами).
6. **Частковий успіх (A2, симуляція):** тимчасово підняти `MAX_OFFSET` до 2000 і запустити
   глибокий скан → скан успішний, у `scan_runs.error` — `graphql window cap hit at
   offset=1040`, зібрані ~1040 оголошень збережені (HTML-fallback НЕ спрацював). Повернути
   константу.
