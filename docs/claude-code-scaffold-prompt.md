## Промпт (встав у Claude Code)

```
Прочитай CLAUDE.md і olx-monitor-spec.md у корені — це канон. Не відхиляйся від стеку, методу збору, схеми БД та інваріантів, описаних там.

Збудуй ТІЛЬКИ Етап 1 (MVP). Не реалізовуй статуси-логіку, нотатки, price_history, Notion чи cron — це наступні етапи.

Скоуп Етапу 1:
1. Monorepo: npm workspaces (server/ + web/), корневий package.json зі скриптами dev / dev:server / dev:web / build / scan.
2. server/src/db/schema.sql — рівно 4 таблиці зі специфікації. db.ts застосовує схему при старті (CREATE TABLE IF NOT EXISTS), better-sqlite3, файл server/data/olx.db.
3. server/src/scraper/:
   - selectors.ts — усі OLX-селектори в одному місці (з CLAUDE.md).
   - olxFetcher.ts — реалізує interface OlxFetcher через fetch + cheerio. Будує URL пошуку з SearchConfig (query + api_filters + range у форматі search[filter_float_*:from/:to]). Обовʼязкові заголовки (UA/Referer/X-Client). Затримка 1–2с, ≤3 сторінки. Повертає RawListing[].
   - normalizer.ts — нормалізує ціну ("6 000 грн." → 6000 + currency), абсолютизує лінк, upsert по olx_id, оновлює last_seen_at. price_history поки НЕ чіпай (таблиця є, запис — Етап 3). filtered_out поки 0.
4. server/src/routes/searches.ts — CRUD searches + POST /api/searches/:id/scan (виклик fetcher → normalizer → запис scan_run, повертає {found, new_count}). listings.ts — GET /api/searches/:id/listings.
5. server/src/index.ts — Fastify bootstrap, CORS для localhost:5173, :3001.
6. server/src/scan.ts — CLI: npm run scan -- --search <id>.
7. web/ — Vite + React + Tailwind + TanStack Query/Table:
   - сторінка зі списком searches + форма створення (name, query, price from/to) + кнопка Scan.
   - таблиця listings: фото-мініатюра, назва (лінк), ціна, місто, дата. Сортування по колонках. Поки без статус-дропдауну й нотаток.

Перед стартом:
- Скажи, які npm-пакети встановиш і які файли створиш. Дай мені підтвердити, тоді став код.
- Обробка помилок скрейпінгу: не валити процес, писати в scan_runs.error.
- НЕ використовуй Playwright. Якщо припускаєш, що HTML не спарситься без JS — зупинись і покажи мені зразок отриманого HTML, не додавай браузер сам.

Працюй маленькими комітами по файлових групах: db → scraper → routes → web. Після кожної групи — коротко що зроблено й що далі.
```

---

## Чекпоінти після Етапу 1

Коли MVP працює (бачиш оголошення в таблиці, повторний скан не дублює):

- **Етап 2:** `Реалізуй Етап 2 зі спеки: статуси (ручні + auto-disable з буфером 2 скани + auto-reactivate, поважаючи status_source=manual), нотатки, інлайн-едіт через PATCH /api/listings/:id, локальні range-фільтри (filtered_out). Дотримуйся інваріантів у CLAUDE.md.`
- **Етап 3:** `Реалізуй Етап 3: запис price_history при зміні ціни в normalizer, GET /api/listings/:id/price-history, спарклайн у таблиці, GET /api/listings/:id/export/markdown (+bulk) для аналізу в Claude.`
- **Етап 4:** `Реалізуй Етап 4: Notion-експорт (@notionhq/client, one-way, match по olx_id), node-cron (off за замовчуванням, per-search cron_enabled), журнал scan_runs у UI.`

## Перевірка MVP вручну

```bash
npm install && npm run dev
# Створи search: query "iphone 13", price 8000–15000
# Натисни Scan → у таблиці зʼявляються оголошення
# Scan ще раз → new_count=0 або малий, дублів у таблиці немає
sqlite3 server/data/olx.db "select count(*), min(price), max(price) from listings;"
```

Якщо парсинг повертає 0 при непорожній видачі — перший підозрюваний: OLX віддав сторінку, що рендериться лише через JS. Тоді перевір `__NEXT_DATA__` у HTML (fallback 4.2 у спеці) перед будь-яким браузером.
