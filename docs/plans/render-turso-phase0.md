# Phase 0 — Міграція persistence-шару: better-sqlite3 → @libsql/client (Turso)

> Статус: **РЕАЛІЗОВАНО** (Phase 0). Усі test-cases пройдені локально проти libSQL `file:`:
> `npm run build -w server` зелений; `/health` ok; реальний скан з live OLX (135/151 оголошень,
> GraphQL) → upsert через інтерактивну транзакцію + дедуп; `applyScanStatuses` disable (miss_count,
> coverage-маркер, `olx_status=inactive`); `PATCH /api/listings/:id` → `status_source='manual'`,
> `miss_count=0`; CLI `npm run scan -- --search <id>`; cascade-delete/recompute через `db.batch`.
> Деплой-конфіг (render.yaml/Static Site/cron) — поза Phase 0, наступні фази.

## Контекст (навіщо)

Мета — підготувати `olx-dashboard` до деплою на **Render + Turso** (усе на безкоштовних
акаунтах), щоб запускати віддалений CI/CD і перевіряти зміни на реальному сервері. Render free
не має постійного диска, тож локальний файл `better-sqlite3` там не виживе. **Схвалена зміна
стеку** (`docs/plans/render-and-turso-prompt.md`): замінити `better-sqlite3` на `@libsql/client`
(Turso). libSQL — SQLite-сумісний, тож заборона PostgreSQL з CLAUDE.md не порушується.

**Змінюється ТІЛЬКИ механізм доступу до БД.** Бізнес-логіка (вікно покриття/`miss_count`,
upsert по `olx_id`, статуси, auto-disable/reactivate), схема БД і метод збору з OLX —
**не чіпаються**. Без ORM/query-builder — лише `@libsql/client`.

Phase 0 = лише код, **повністю тестований локально** (libSQL з `url: 'file:...'` — той самий
async API, що й Turso в проді).

**OUT (наступні фази, НЕ робити тут):** `render.yaml`, Static Site, rewrite-правила, cron,
будь-яка деплой-конфігурація.

### Уточнення обсягу (інвентар застарів)

`docs/plans/inventar-db-calls.md` описує СТАРУ структуру (`scanner.ts` монолітом, `analysis.ts`
одним файлом, без роутів `projects`/`aiPicks`/`relevance`/`searchSynonyms`). **Фактично зараз:
~98 викликів `db.*` у 16 файлах**, а не «72 у 8». Скан рефакторено в директорію `scanner/`,
аналіз — у `routes/analysis/`. План спирається на **живий стан коду**.

### Підтверджено по docs libSQL (де-ризик)

- **Named-параметри:** SQL використовує `@name`/`:name`/`$name`, ключі args-обʼєкта — **без
  сигіла** (`{ olx_id: ... }`). Збігається з конвенцією better-sqlite3 → великий `upsertStmt`
  з `@olx_id`-плейсхолдерами мігрує майже без змін (`.run(obj)` → `await db.execute({ sql, args: obj })`).
- `ResultSet.lastInsertRowid: bigint | undefined` → конвертувати `Number(...)`. `rowsAffected: number`.
- `client.transaction('write')` (інтерактивна: `tx.execute`/`commit`/`rollback`),
  `client.batch([...], 'write')` (набір записів у неявній транзакції),
  `client.executeMultiple(sql)` (multi-statement без параметрів — для застосування `schema.sql`).

---

## Файли (що і де правиться)

| Файл | Викликів | Тип правок |
|---|---|---|
| `server/package.json` | — | -better-sqlite3/-@types/better-sqlite3, +@libsql/client |
| `server/src/env.ts` | — | **новий** side-effect лоадер `.env` |
| `server/src/db/db.ts` | 17→~2 | createClient + `initDb()`; видалити весь міграц-скаффолд |
| `server/src/index.ts` | — | `await initDb()`, host `0.0.0.0`, CORS з `WEB_ORIGIN` |
| `server/src/scan.ts` | — | `await initDb()` на старті |
| `server/src/migratePostedAt.ts` | 2 | `await initDb()`; batch UPDATE |
| `server/src/scraper/normalizer.ts` | 6 | 🔁 інтерактивна tx (upsert), async |
| `server/src/scraper/statusEngine.ts` | 7 | 🔁 інтерактивна tx (miss_count), async |
| `server/src/scanner/searchLoader.ts` | 1 | async helper |
| `server/src/scanner/scanRunLifecycle.ts` | 3 | SQL-константи, async |
| `server/src/scanner/scanFinalize.ts` | 3 | SQL-константи, async |
| `server/src/scanner/analyzeScan.ts` | 1 | async; `selectKnownOlxIds` await |
| `server/src/scanner/verifyScan.ts` | 6 | послідовні `await execute` (НЕ одна tx) |
| `server/src/routes/searches.ts` | 21 | read/INSERT/⚙️ batch (cascade/swap/recompute) |
| `server/src/routes/projects.ts` | 15 | read/INSERT/⚙️ batch (delete/swap) |
| `server/src/routes/listings.ts` | 3 | read + динамічний UPDATE |
| `server/src/routes/analysis/commit.ts` | 3 | 🔁 інтерактивна tx |
| `server/src/routes/analysis/criteria.ts` | 1 | UPDATE async |
| `server/src/routes/aiPicks.ts` | 3 | 🔁/⚙️ tx |
| `server/src/routes/relevance.ts` | 2 | 🔁 tx |
| `server/src/analysis/repo.ts` | 5 | усі helper-и → async |
| `server/.env.example` | — | +TURSO_DATABASE_URL/TURSO_AUTH_TOKEN/WEB_ORIGIN |

Позначки: 🔁 = інтерактивна транзакція (read+умова+write), ⚙️ = чистий набір записів (batch),
🧱 = module-level `db.prepare` → SQL-константа.

### Єдиний патерн заміни sync → async

```
.get(args)  → const { rows } = await db.execute({ sql, args }); rows[0] ?? undefined
.all(args)  → const { rows } = await db.execute({ sql, args }); → rows
.run(args)  → const r = await db.execute({ sql, args }); Number(r.lastInsertRowid)/Number(r.rowsAffected)
db.exec(multi)            → await db.executeMultiple(sql)
const X = db.prepare(sql) → const X_SQL = sql; виклики → await db.execute({ sql: X_SQL, args })
```
Named-args (`@col`) лишаємо в SQL, передаємо обʼєкт у `args`. Динамічний WHERE /
`IN (${placeholders})` / `UPDATE ... ${fields.join(',')}` — лишити, лише обгорнути в `execute`.

---

## Кроки (з чекбоксами)

### Крок 1 — Залежності
- [ ] `server/package.json`: прибрати `better-sqlite3`, `@types/better-sqlite3`; додати `@libsql/client`.
- [ ] `npm install` (оновити lockfile).

### Крок 2 — `.env` ДО ініціалізації клієнта БД
- [ ] Створити `server/src/env.ts` — `process.loadEnvFile(<server/.env>)` у `try/catch` (відсутній
  файл — не помилка; патерн з `analysis/config.ts:14`).
- [ ] `server/src/db/db.ts` ПЕРШИМ рядком `import '../env.js';` — env для будь-якого імпортера `db`.

### Крок 3 — Переписати `db.ts` (17→~2 виклики)
- [ ] `createClient({ url: process.env.TURSO_DATABASE_URL ?? 'file:./data/olx.db', authToken: process.env.TURSO_AUTH_TOKEN })`
  (локальний дефолт зберігає поточний dev-флоу; `authToken` для `file:` не потрібен).
- [ ] `export async function initDb()` → `await db.executeMultiple(readFileSync(SCHEMA_PATH))`.
- [ ] **Видалити повністю:** `pragma(journal_mode/foreign_keys/user_version)`, `addColumnIfMissing`
  (+усі ~30 викликів), `migrateListingsTable` + `LISTINGS_*`, `backfillSortOrder`, `mkdirSync`,
  імпорт `Database`. Це апгрейд-скаффолд лише для існуючих локальних better-sqlite3 БД.
- [ ] **Звірка (зроблено):** усі колонки з `addColumnIfMissing` уже присутні в `schema.sql` →
  дозаповнювати схему НЕ треба. Якщо під час реалізації знайдеться розбіжність — правити
  `schema.sql`, НЕ повертати ALTER-логіку.
- [ ] Перевірити, що `scripts/copyAssets.mjs` копіює `schema.sql` у `dist` (initDb читає з диску).

### Крок 4 — `index.ts`
- [ ] `await initDb()` перед `app.listen`.
- [ ] `host: '0.0.0.0'`; CORS `origin: process.env.WEB_ORIGIN ?? 'http://localhost:5173'`.

### Крок 5 — CLI-входи
- [ ] `scan.ts` і `migratePostedAt.ts`: `await initDb()` на старті (схема більше не side-effect імпорту).

### Крок 6 — Заміна по файлах

**Read-кластери (await + async helper):** `listings.ts`, `analysis/repo.ts` (усі функції →
async, `await` у викликах із `routes/analysis/*`, `relevance.ts`, `searchSynonyms.ts`),
`analysis/criteria.ts`, `scanner/searchLoader.ts`, `scanner/scanRunLifecycle.ts`,
`scanner/scanFinalize.ts`, `scanner/analyzeScan.ts` (+`selectKnownOlxIds` await).

**⚙️ batch (чисті записи):**
- [ ] `searches.ts` deleteCascade (4 DELETE), swap (2 UPDATE), recompute filtered_out
  (рішення пораховані в JS наперед, read до tx) → `db.batch([...], 'write')`.
- [ ] `projects.ts` deleteTx (UPDATE+DELETE), swap (2 UPDATE) → batch.
- [ ] `migratePostedAt.ts` UPDATE-цикл → batch (`parseOlxDate→null` ок).

**🔁 інтерактивні транзакції (НЕ batch):**
- [ ] `normalizer.ts` `upsertListings` → async, `transaction('write')`: per-item
  exists(read)→upsert(write)→selectForFilter(read)→updateFilteredOut(write); module-stmt →
  SQL-константи; `commit`/`catch→rollback`. **Зберегти семантику** (newCount/isNew/filtered_out).
  `selectKnownOlxIds` → async.
- [ ] `statusEngine.ts` `applyScanStatuses` → async, `transaction('write')`: 4 динамічні SELECT
  → `tx.execute`, цикл UPDATE → `tx.execute`. **Зберегти `miss_count+=1` та умову disable**
  (`miss_count>=threshold AND (auto|rejected)`), `olx_status='inactive'`, маркер у note.
- [ ] `analysis/commit.ts` per-row read `val` + умовний write → `transaction('write')`;
  `info.changes` → `Number(rowsAffected)`.
- [ ] `aiPicks.ts` clear+set-цикл → `transaction('write')`.
- [ ] `relevance.ts` commit-цикл → `transaction('write')` (manual-override пропуск зберегти).

**`searches.ts` решта (stats/get/INSERT):** INSERT → `Number(lastInsertRowid)`; ⚠️
`samplesByKey.get(...)` — це `Map.get` у JS, **НЕ чіпати**.

### Крок 7 — Async-пропагація
- [ ] Додати `await` на кожен виклик функцій, що стали async (`upsertListings`, `selectKnownOlxIds`,
  `applyScanStatuses`, `loadSearch`, `repo.ts`-функції, lifecycle/finalize-хелпери) у
  `scanner/runScan.ts`, `verifyScan.ts`, `analyzeScan.ts`, `routes/**`. Route-хендлери й
  scanner-функції вже async — пропагація лишається в межах наявних async-функцій.
- [ ] `runVerify`: оновлення рядків по одному в циклі з мережевими probe між ними — **лишити
  послідовні `await db.execute`** (НЕ одна транзакція).

### Крок 8 — Env-приклад
- [ ] `server/.env.example`: `TURSO_DATABASE_URL=` (коментар: локально `file:server/data/olx.db`),
  `TURSO_AUTH_TOKEN=` (для `file:` не треба), `WEB_ORIGIN=`. Лишити `OPENROUTER_API_KEY`.

### Крок 9 — Типи (strict)
- [ ] libSQL `rows` — `{col: value}`; INTEGER можуть приходити як `bigint` → явний `Number(...)`.
  Звірити з `server/src/types.ts`; без `any` у scraper/db/logic (касти `as Row` лишити).

---

## Test-cases (перевірити після реалізації)

1. [ ] `npm run build -w server` — компілюється без помилок (strict, без `any` у ядрі).
2. [ ] `TURSO_DATABASE_URL='file:server/data/olx.db'`: старт сервера, `GET /health` → `{ok:true}`.
3. [ ] `POST /api/searches` → `POST /api/searches/:id/scan` → `GET listings`: оголошення є;
   повторний scan не дублює (дедуп по `olx_id`).
4. [ ] Повторний scan переводить зниклі у `disabled` за тією ж `miss_count`-логікою (інтерактивна
   tx `statusEngine` дає той самий результат).
5. [ ] `PATCH /api/listings/:id` (статус) → `status_source='manual'`, `miss_count=0`.
6. [ ] CLI: `npm run scan -w server -- --search <id>` і `--verify` працюють (async).
7. [ ] `PATCH /api/searches/:id` з `local_filters` → ретроактивний перерахунок `filtered_out` (batch).
8. [ ] Видалення пошуку (cascade) і drag-reorder (swap) — batch-транзакції цілісні.
9. [ ] (Якщо є акаунт Turso) ті самі сценарії проти реального Turso URL + `authToken`.

## Ризики / тонкі місця

- **Інтерактивні транзакції (normalizer/statusEngine/commit)** — найтонше: read→умова→write має
  лишитись атомарним і семантично ідентичним. Покривається test-cases 3–5.
- **Named-args `@col`** в `upsertStmt` — підтверджено сумісні з libSQL; звірити, що кожен
  `@`-плейсхолдер має ключ у args-обʼєкті.
- **BigInt** — `lastInsertRowid`/`rowsAffected` → `Number(...)` усюди (INSERT searches/projects/
  scan_runs, commit changes).
- **Існуючий локальний `olx.db`** — libSQL `file:` відкриває наявний SQLite-файл; усі колонки вже
  є (історичний `addColumnIfMissing` відпрацював), тож спрощений `initDb` (CREATE IF NOT EXISTS)
  його не ламає. Fresh-клон → схема з нуля з `schema.sql`.
- **Порядок env** — `db.ts` читає `TURSO_DATABASE_URL` на імпорті; `import '../env.js'` першим
  рядком гарантує завантаження. Без цього — `createClient` з `undefined` url.

## Verification (E2E)

- `npm run build -w server` (strict-гейт).
- `TURSO_DATABASE_URL='file:server/data/olx.db' npm run dev:server` → `curl localhost:3001/health`.
- Прогнати test-cases 3–8 через REST (`curl`/UI `npm run dev`), порівняти поведінку
  дедупу/disable/filtered_out з поточною (до міграції) на тих самих даних.
- Опційно проти реального Turso (free) — test-case 9.
