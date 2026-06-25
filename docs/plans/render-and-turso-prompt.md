Ти працюєш над моїм проєктом olx-dashboard (monorepo npm workspaces: server/ + web/).
Обовʼязково прочитай CLAUDE.md і docs/architecture.md перед початком — дотримуйся всіх
інваріантів і конвенцій звідти.

# Завдання: Phase 0 — підготувати застосунок до деплою на Render + Turso

Це СХВАЛЕНА мною зміна стеку persistence-шару: better-sqlite3 → @libsql/client (Turso).
libSQL — SQLite-сумісний, тож заборона PostgreSQL з CLAUDE.md не порушується; бізнес-логіка,
схема БД і метод збору з OLX НЕ змінюються — міняється ТІЛЬКИ механізм доступу до БД.

## Спочатку — ПЛАН, без коду
Згідно з конвенцією репо: ПЕРШИМ кроком створи docs/plans/render-turso-phase0.md
у форматі наявних планів (Контекст → Файли → Кроки з чекбоксами → Test-cases → Ризики).
Перелічи В НЬОМУ кожен файл і кожне місце правки. Зупинись і дай мені план на рев'ю
ПЕРЕД будь-якими змінами коду.

## Скоуп Phase 0 (тільки код, локально-тестовано)
IN:
1. Замінити better-sqlite3 → @libsql/client у всіх місцях (зараз ~72 виклики db.* у 8 файлах:
   server/src/db/db.ts, scanner.ts, scraper/normalizer.ts, scraper/statusEngine.ts,
   routes/searches.ts, routes/listings.ts, routes/analysis.ts, migratePostedAt.ts).
2. Зробити весь шар доступу до БД async (хвиля await по викликах, функції стають async).
3. Спростити db.ts (див. нижче).
4. server/src/index.ts: host '0.0.0.0' (не 127.0.0.1), CORS origin з env WEB_ORIGIN,
   PORT з env (вже є).
5. Env: оновити server/.env.example (+ TURSO_DATABASE_URL, TURSO_AUTH_TOKEN, WEB_ORIGIN),
   гарантувати завантаження .env ДО імпорту db.ts (зараз .env читається лише в
   analysis/config.ts — цього замало, бо db.ts читає TURSO_* на старті).

OUT (НЕ робити в Phase 0): render.yaml, Static Site, rewrite-правила, будь-яка
деплой-конфігурація, cron. Це наступні фази. Phase 0 має лишатися повністю тестованою локально.

## Правила міграції БД (критично — врахуй кожен пункт)

Клієнт (db.ts):
  import { createClient } from '@libsql/client';
  export const db = createClient({
    url: process.env.TURSO_DATABASE_URL!,      // локально: 'file:server/data/olx.db'
    authToken: process.env.TURSO_AUTH_TOKEN,   // локально для file: не потрібен
  });
- Єдиний код-шлях для локалки і прода: локально використовуй libSQL з url 'file:...'
  (той самий async API), у проді — Turso URL. НЕ лишати паралельно better-sqlite3.

Мапа API (sync → async):
  db.prepare(sql).get(args)  → const { rows } = await db.execute({ sql, args:[...] }); rows[0] ?? undefined
  db.prepare(sql).all(args)  → const { rows } = await db.execute({ sql, args:[...] }); → rows
  db.prepare(sql).run(args)  → const r = await db.execute({ sql, args:[...] });
  info.lastInsertRowid       → Number(r.lastInsertRowid)   // BigInt у libSQL — конвертуй
  info.changes               → Number(r.rowsAffected)
  db.exec(multiStatementSql) → await db.executeMultiple(sql)

Транзакції — найтонше місце:
- db.transaction(fn) у better-sqlite3 виконує JS-логіку (read → decide → write) атомарно.
  libSQL db.batch([...]) НЕ підходить там, де всередині є умовні рішення на основі читань
  (це є в normalizer.upsertListings, statusEngine.applyScanStatuses, scanner.runVerify,
  routes/searches PATCH-перерахунок filtered_out).
- Для таких місць використовуй ІНТЕРАКТИВНУ транзакцію libSQL:
    const tx = await db.transaction('write');
    try { await tx.execute(...); /* читання+умови+записи */ await tx.commit(); }
    catch (e) { await tx.rollback(); throw e; }
- db.batch([...], 'write') використовуй ЛИШЕ для чистих наборів записів без проміжних рішень.

Спрощення db.ts (Turso = порожня БД):
- Прибрати історичний міграційний скаффолд, потрібний лише для апгрейду існуючих ЛОКАЛЬНИХ
  баз: addColumnIfMissing, migrateListingsTable (rebuild через user_version),
  backfillSortOrder, PRAGMA foreign_keys-танці, journal_mode=WAL (Turso керує сам).
- Натомість застосувати канонічний server/src/db/schema.sql ОДИН раз через
  await db.executeMultiple(schema). schema.sql вже використовує CREATE TABLE IF NOT EXISTS
  і datetime('now') defaults — лишити як є, це джерело істини.
- Якщо в schema.sql чогось бракує проти фінального стану (звір зі стовпцями, які раніше
  додавались через addColumnIfMissing) — дозаповни schema.sql, а не повертай ALTER-логіку.
- Винеси ініціалізацію БД (executeMultiple схеми) в async-функцію initDb(), яку викликати
  на старті ДО app.listen у index.ts (бо top-level await на createClient-only недостатньо
  для застосування схеми).

Типи значень libSQL:
- rows — обʼєкти {колонка: значення}. Звір типи з доменними інтерфейсами (types.ts):
  без 'any' у доменному ядрі (scraper/db/logic) — конвертуй явно де треба (Number(...) для
  INTEGER-полів, що приходять як BigInt).

## index.ts
  const PORT = Number(process.env.PORT ?? 3001);
  await app.register(cors, { origin: process.env.WEB_ORIGIN ?? 'http://localhost:5173' });
  await initDb();
  await app.listen({ port: PORT, host: '0.0.0.0' });

## Обмеження / конвенції (з CLAUDE.md)
- TypeScript strict, без 'any' у scraper/db/logic.
- Коментарі та UI-текст — українською; код/ідентифікатори — англійською.
- НЕ міняти бізнес-інваріанти: вікно покриття (miss_count/last_refresh_at), upsert по olx_id
  з ON CONFLICT, статусну логіку, auto-disable/reactivate, метод збору з OLX. Лише механізм БД.
- Зберегти точну семантику наявних транзакцій (атомарність upsert-циклу, statusEngine, verify).
- НЕ додавати ORM / query-builder — тільки @libsql/client.
- Після реалізації — запропонувати текст git commit повідомлення англійською (тільки текст).

## Test-cases (внести у план і перевірити після реалізації)
1. npm run build -w server — компілюється без помилок (strict).
2. Локально з TURSO_DATABASE_URL='file:server/data/olx.db': старт сервера, GET /health → ok.
3. Створити пошук (POST /api/searches) → POST /api/searches/:id/scan → GET listings:
   оголошення зʼявляються, дедуплікація по olx_id працює (повторний scan не дублює).
4. Повторний scan переводить зниклі у disabled за тією ж логікою miss_count (перевір, що
   інтерактивна транзакція statusEngine дає той самий результат, що й раніше).
5. PATCH /api/listings/:id (статус) → status_source='manual', miss_count=0.
6. CLI: npm run scan -w server -- --search <id> і --verify працюють (теж async).
7. (Якщо є акаунт Turso) ті самі сценарії проти реального Turso URL + authToken.

Почни з плану в docs/plans/render-turso-phase0.md і дай його мені на підтвердження.