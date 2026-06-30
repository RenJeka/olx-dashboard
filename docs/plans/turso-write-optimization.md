# План: оптимізація запису у Turso (write amplification глибокого скану)

## Контекст / мотивація

Глибокий скан, що додав **+876 нових** оголошень, підняв Turso "rows written" на **+6 500**
(3 000 → 9 500). Користувач запідозрив повторний запис тих самих рядків.

Реальна причина (не дослівне дублювання):

1. **Драйвер — `@libsql/client` (Turso).** Метрика *rows written* рахує **кожен запис у
   вторинний індекс**, не лише рядок таблиці.
2. **`listings` мав 3 індекси** (`schema.sql`): `(search_id, status)`,
   `(search_id, last_refresh_at)`, `(search_id, last_seen_at)`.
3. **UPSERT завжди переписував індексовані колонки.** `UPSERT_SQL` (`normalizer.ts`) ставить
   `last_seen_at = datetime('now')` на **кожен** рядок, а `last_refresh_at` і `status` теж у
   `SET`. SQLite переписує індекс, щойно його колонка є у `SET` (рішення на етапі компіляції,
   без порівняння значень). Тож **кожен запис рядка = 1 таблиця + 3 індекси = 4 rows_written**,
   байдуже новий рядок чи незмінний.
4. **Кожне побачене оголошення перезаписувалось щоскану** — і нові, і вже відомі. Тож
   ~876 нових + ~750 уже відомих ≈ 1 626 × 4 ≈ **6 500**. (Synonym/split-скани вже дедуплять по
   `olx_id` перед єдиним `db.batch` — подвійного upsert у межах одного скану немає.)
5. Другорядне: `applyScanStatuses` (`statusEngine.ts`) робив **один `tx.execute` на кожного
   відсутнього кандидата** (N мережевих round-trip), а гілка без disable дарма переписувала
   індекс `status`.

**Мета:** прибрати перезапис незмінних рядків та індексну амплітуду. Очікувано: один глибокий
скан ~6 500 → ~3 400 rows_written (~−48%); повторні скани переважно незмінних оголошень
колапсують у ~0 записів. Поведінка (статуси, вікно покриття, verify) — незмінна.

## Рішення (узгоджено з користувачем)

- **Обсяг:** діф на рівні застосунку + прибрати індекс `last_seen` + батчити цикл statusEngine.
- **Свіжість `last_seen_at`:** оновлювати **не частіше разу на день** (touch лише коли старший ~1 дня).

## Файли і зміни

### 1. Діф перед записом — `server/src/scraper/normalizer.ts` (`upsertListings`)

- `loadExistingByOlxId` тепер тягне всі колонки для детекції no-op (`SELECT_EXISTING_FIELDS`).
- `hasBusinessChange(existing, computed)` — дзеркало семантики `UPSERT_SQL`: `true` (потрібен
  повний upsert), якщо відрізняється будь-яке завжди-перезаписуване поле
  (`title/url/price/currency/city/photo_url`), GraphQL-дата (`posted_at/last_refresh_at`),
  `filtered_out`, COALESCE-поле з новим НЕ-null іншим значенням, або статусний CASE дав би перехід
  (миттєвий disable / auto-реактивація). **За сумніву — повний upsert** (зайвий запис безпечний).
- Класифікація: **новий / HTML-fallback / змінений GraphQL** → повний `UPSERT_SQL` у `db.batch`;
  **незмінний GraphQL** → `touchOlxIds` (без повного upsert).
- Дешевий touch (`TOUCH_PREFIX`/`TOUCH_SUFFIX`), чанками по `IN_CHUNK`:
  `UPDATE listings SET last_seen_at = datetime('now'), miss_count = 0 WHERE olx_id IN (…)
   AND (miss_count != 0 OR last_seen_at IS NULL OR last_seen_at < datetime('now','-1 day'))`.
  Throttle once/day — у самому WHERE: ще «свіжі» рядки з `miss_count=0` не оновлюються взагалі
  (0 записів). Без індексу по `last_seen_at` це 1 table-write/рядок, без index-write.
- Усе (повні upsert-и + touch) — одним `db.batch('write')` (guard на порожній масив).

### 2. Прибрати індекс `last_seen_at`

- `server/src/db/schema.sql`: видалено `CREATE INDEX idx_listings_search_lastseen`.
- `server/src/db/db.ts` (`initDb`): `DROP INDEX IF EXISTS idx_listings_search_lastseen` — для вже
  задеплоєних БД.
- Verify-прохід P1 (`scanner/verifyScan.ts`, `last_seen_at < now-3d ORDER BY last_seen_at ASC
  LIMIT 50`) тепер scan+sort по рядках одного пошуку — мізерно на кількох тисячах рядків; throttle
  once/day тримає побачені рядки всередині 3-денного вікна.

### 3. Батч statusEngine — `server/src/scraper/statusEngine.ts`

- Цикл `tx.execute`-на-рядок → один `db.batch('write')` (1 round-trip замість N).
- `UPDATE_CANDIDATE_SQL` (гілка без disable) тепер `UPDATE listings SET miss_count = ? WHERE id = ?`
  — без `status`/`note` у `SET`, тож не переписує індекс `status` на кожному інкременті.

## Тест-кейси (перевірено локально на `file:` libSQL)

- Перший скан 3 нових → `new_count=3`, статуси `new`, `last_seen_at` виставлено.
- Повторний скан без змін → `new_count=0`; застарілий (`>1 дня`) рядок → touch оновив `last_seen_at`;
  рядок з `miss_count=2` → скинуто в 0; свіжий рядок з `miss_count=0` → `last_seen_at` НЕ змінився.
- Зміна `price` → повний upsert застосовує нову ціну.
- `olx_status` неактивний → миттєвий disable + маркер у `note`; повернення active → `disabled→new`.
- Вікно покриття (deep, threshold=1): відсутній рядок → `miss_count+1`, disable + маркер `coverage`.
- Verify-P1 SELECT і `sqlite_master` — індекс `idx_listings_search_lastseen` відсутній.

## Перевірка виграшу

Зафіксувати Turso "rows written" до/після одного глибокого скану: очікувано ~нові × 3 +
torкнуті × 1 (≈3 400 замість ~6 500); повторний скан того ж дня без змін → ~0 нових записів.
Методика — `.claude/skills/turso-reads-playbook` (той самий before/after через дашборд Turso).
