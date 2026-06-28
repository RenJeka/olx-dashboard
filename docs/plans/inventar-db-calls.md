## Інвентар усіх викликів db.* (повний — нічого не пропусти)

Номери рядків — орієнтовні (гілка main). Згруповано по файлах; для кожного кластера —
як конвертувати. Позначки: 🔁 = інтерактивна транзакція (read+умова+write), ⚙️ = чистий
набір записів (можна batch), 🧱 = prepared-statement на рівні модуля (прибрати — замінити
на SQL-константу + await execute), ⚠️ = особливий випадок.

### server/src/db/db.ts  — БІЛЬШІСТЬ ВИДАЛЯЄТЬСЯ (спрощення схеми)
- 16,17  db.pragma('journal_mode'/'foreign_keys')      → ВИДАЛИТИ (Turso керує сам)
- 21     db.exec(schema)                               → await db.executeMultiple(schema) у initDb()
- 33     db.prepare(`PRAGMA table_info`).all()         → addColumnIfMissing ВИДАЛИТИ цілком
- 36     db.exec('ALTER TABLE ... ADD COLUMN')         → ВИДАЛИТИ (дозаповнити schema.sql)
- 70,75,121,122  db.pragma(user_version/foreign_keys)  → ВИДАЛИТИ
- 77 🔁  db.transaction(migrate)                        → ВИДАЛИТИ (rebuild не потрібен на порожній БД)
- 78,110,115,116,117 db.exec(...)                      → ВИДАЛИТИ (частина rebuild)
- 144,147,148 🔁 backfillSortOrder + db.transaction     → ВИДАЛИТИ (лише для існуючих локальних БД)
  ⚠️ Перед видаленням: звір, що всі колонки, які раніше додавались через addColumnIfMissing,
     присутні у schema.sql. Якщо ні — додай їх у schema.sql, НЕ повертай ALTER-логіку.

### server/src/scraper/normalizer.ts  — upsertListings стає async
- 46–51 🧱 existsStmt/searchLocalFiltersStmt/selectForFilterStmt/updateFilteredOutStmt
                                                        → SQL-константи (рядки), не prepare
- 64 🧱  upsertStmt (великий INSERT ... ON CONFLICT)    → SQL-константа
- 137    searchLocalFiltersStmt.get(searchId)          → await db.execute (поза транзакцією — read)
- 147 🔁 db.transaction((items) => {...})               → ІНТЕРАКТИВНА tx: const tx = await db.transaction('write')
- 149    existsStmt.get(item.olxId)                     → await tx.execute (read усередині tx)
- 192    upsertStmt.run({...})                          → await tx.execute (named args → object у args)
  ⚠️ Named-параметри (@olx_id, @is_graphql...) libSQL підтримує: args як обʼєкт {olx_id: ...}.
     Звір, що всі @-плейсхолдери мапляться на ключі args.
- 215    selectForFilterStmt.get(item.olxId)           → await tx.execute (read у тій самій tx)
- 220    updateFilteredOutStmt.run(...)                 → await tx.execute
     Наприкінці: await tx.commit() / catch → await tx.rollback().

### server/src/scraper/statusEngine.ts  — applyScanStatuses стає async
- 14 🧱  updateCandidateStmt                            → SQL-константа
- 63 🔁  db.transaction(() => {...})                    → ІНТЕРАКТИВНА tx('write')
- 69–90  db.prepare(...).all(...) (4 варіанти запиту)   → await tx.execute (динамічний WHERE/плейсхолдери лишити)
- 106    updateCandidateStmt.run(...)                   → await tx.execute у циклі
  ⚠️ Зберегти точну семантику miss_count += 1 і умову disable (miss_count>=2 AND auto|rejected).

### server/src/scanner.ts  — runScan / runVerify стають async (вже async — лишити)
- 54     .get(id) (loadSearch)                          → await db.execute; rows[0] ?? null
- 154 ⚠️ INSERT scan_runs ... .run(...).lastInsertRowid → const r = await db.execute(...); Number(r.lastInsertRowid)
- 159,166,191 db.prepare(...).run(...) (progress/visible)→ await db.execute
- 197 ⚙️ INSERT/UPDATE scan_runs finish                  → await db.execute
- 211    UPDATE scan_runs error (catch)                 → await db.execute
- 256,264 .all(searchId, cap) (loadVerifyCandidates)    → await db.execute
- 273,277 .get(searchId) (countVerifyCandidates)        → await db.execute
- 288,290 🧱 updateDeadStmt / updateAliveStmt           → SQL-константи (updateAliveStmt — named args)
- 311    .get(searchId)                                 → await db.execute
- 319 ⚠️ INSERT scan_runs verify ... .lastInsertRowid    → Number(r.lastInsertRowid)
- 324,350,362,375,388,390,402 .run(...) (progress/dead/alive/finish/error)
                                                        → await db.execute
  ⚠️ runVerify оновлює рядки по одному в циклі з мережевими probe між ними — це НЕ одна
     транзакція (і не має бути): лиши послідовні await db.execute, як зараз послідовні .run.

### server/src/routes/searches.ts  — усі хендлери вже async
- 28     .all() (список)                               → await db.execute → rows
- 35     .get(id)                                       → rows[0] ?? 404
- 48     SELECT MIN(sort_order).get()                   → await db.execute
- 58 ⚠️  INSERT searches .run(...) → info.lastInsertRowid→ Number(r.lastInsertRowid)
- 73     .get(Number(info.lastInsertRowid))             → await db.execute
- 82,115,120,125 .get/.run (PATCH полів)               → await db.execute
- 137    SELECT listings .all(id)                       → await db.execute
- 139 🧱 updateFilteredOut                              → SQL-константа
- 140 🔁 db.transaction(recompute)                      → ІНТЕРАКТИВНА tx('write') (read зроблено до tx; усередині — лише UPDATE-и → можна ⚙️ batch, якщо рішення filtered_out пораховані заздалегідь у JS)
- 145    updateFilteredOut.run(...)                     → tx.execute / batch
- 161    .get(id)                                       → await db.execute
- 166 ⚙️ db.transaction(deleteCascade) — 4 DELETE       → batch([...], 'write') (чисті записи, без умов)
- 167–172 .run(searchId) ×4                             → елементи batch
- 190,203 .get (move: current/neighbor)                → await db.execute
- 206 ⚙️ db.transaction(swap) — 2 UPDATE                 → batch([...], 'write')
- 208–210 update.run ×2                                 → елементи batch
- 216    .get(id)                                       → await db.execute
- 240,262 .get(id)                                      → await db.execute
- 273    SELECT params .all(id)                         → await db.execute
- 300,305,312,319 .get (stats: search/in_db/stale/last_scan) → await db.execute
  ⚠️ 285 samplesByKey.get(...) — це Map.get у JS, НЕ БД. НЕ чіпати.

### server/src/routes/listings.ts  — async
- 40     SELECT listings .all(searchId)                 → await db.execute → rows
- 48     .get(id) (existing)                            → await db.execute
- 79     UPDATE listings .run(...values)                → await db.execute (динамічні поля — args з масиву)
- 82     SELECT ... .get(id) (повернути оновлений)      → await db.execute; rows[0]

### server/src/routes/analysis.ts  — async
- 50,56  getSearch/getSavedCriteria .get(id)           → await db.execute (функції стають async)
- 72,79  loadListings .all(...)                         → await db.execute
- 195    UPDATE searches analysis_criteria .run(...)    → await db.execute
- 376 🧱 stmt (UPDATE listings SET <col>=...)           → SQL-константа (col з whitelist isMode — лишити)
- 382 ⚙️ db.transaction(commit) — UPDATE у циклі        → batch([...], 'write') (чисті записи)
- 387,388 ⚠️ info = stmt.run(...); updated += info.changes → Number(r.rowsAffected) (для batch — підсумуй rowsAffected по результатах)
  ⚠️ getSearch/getSavedCriteria/loadListings/descriptionMap зараз sync-хелпери — зроби async
     і додай await у всіх викликах усередині хендлерів.

### server/src/migratePostedAt.ts  — top-level await script
- 16     SELECT ... .all() as Row[]                     → await db.execute
- 18 🧱  updateStmt                                      → SQL-константа
- 23 ⚙️  db.transaction(items) — UPDATE у циклі          → batch([...], 'write')
- 26     updateStmt.run(iso, row.id)                    → елементи batch
  ⚠️ parseOlxDate може дати null → передавай null у args (libSQL приймає null).

## Контрольна сума
~72 виклики db.* у 8 файлах. Очікуваний підсумок Phase 0:
- db.ts: з ~20 викликів лишається ~2 (createClient + executeMultiple схеми в initDb).
- Кожен sync .get/.all/.run → await execute; кожна 🔁-транзакція → interactive tx;
  кожна ⚙️ → batch('write'); кожен 🧱 prepared-stmt → SQL-константа.
- Усі функції-хелпери з БД (loadSearch, getSearch, getSavedCriteria, loadListings,
  loadVerifyCandidates, countVerifyCandidates, upsertListings, applyScanStatuses) → async.