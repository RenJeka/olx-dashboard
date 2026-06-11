# OLX Monitor — Архітектура та специфікація

> Персональна система моніторингу оголошень OLX.ua: напівавтоматичний збір, таблиця порівняння, статуси, нотатки, історія цін, експорт у Notion.

---

## 1. Загальна концепція

**Гібридний підхід (варіант C):** готова техніка скрейпінгу (прихований JSON API OLX, як у `darkov19/olx-telegram-bot`) + власний бекенд/БД/фронтенд під твій стек (Node.js + React).

**Чому не форк готового проекту цілком:** жоден проект зі звіту не має UI з таблицею, статусами та нотатками. Найближчі (`Parser-of-olx`, `lerdem/olx-parser`) — Python без фронтенду. Дешевше взяти лише їхній підхід до збору даних.

**Масштаб:** 1–5 активних пошуків, 10–100 оголошень на пошук → SQLite достатньо, PostgreSQL не потрібен.

---

## 2. Архітектура

```mermaid
flowchart LR
    subgraph Backend [Node.js + Fastify]
        SCR[Scraper module<br/>OLX JSON API] --> NORM[Normalizer<br/>+ dedup]
        NORM --> DB[(SQLite<br/>better-sqlite3)]
        SCHED[node-cron<br/>опційно] --> SCR
        API[REST API] --> DB
        NOTION[Notion exporter] --> DB
    end
    UI[React SPA<br/>Vite + TanStack Table] <--> API
    USER((Ти)) -->|Run scan| UI
    USER -->|статуси, нотатки| UI
    NOTION -->|Notion API| N[(Notion DB)]
```

**Потік даних:**
1. Ти створюєш Search (запит + фільтри-діапазони) в UI.
2. Кнопка **Scan** (або cron) → бекенд тягне OLX JSON API посторінково.
3. Normalizer: upsert за `olx_id`, фіксація зміни ціни в `price_history`, оновлення `last_seen_at`.
4. Оголошення, що зникли з видачі → автоматично `disabled`.
5. UI показує таблицю: сортування/фільтри по характеристиках, інлайн-редагування статусу й нотаток.
6. Кнопка **Export to Notion** → створення/синхронізація Notion database.

---

## 3. Технологічний стек

| Шар | Вибір | Чому |
| --- | --- | --- |
| Backend | Node.js 20+, Fastify | Твій основний стек; Fastify легший за Express, вбудована схема-валідація |
| БД | SQLite (`better-sqlite3`) | Локально, 0 конфігурації, синхронний API, файл легко бекапити |
| Збір даних | GraphQL `POST /apigateway/graphql` (основний); `fetch` + `cheerio` static HTML (fallback) | GraphQL верифіковано живим тестом 2026-06-10 (без кукі/auth); HTML підтверджено кодом lerdem; без Playwright; легко на Orange Pi |
| Frontend | React 18 + Vite + TanStack Table + Tailwind | TanStack Table = сортування/фільтри/інлайн-едіт з коробки |
| Стан | TanStack Query | Кеш + рефетч після сканування |
| Планувальник | `node-cron` (опційно, off за замовчуванням) | "Перш за все вручну" |
| Notion | `@notionhq/client` | Офіційний SDK; internal integration token |

---

## 4. Збір даних (Scraper module)

> ✅ Обидва методи підтверджені: GraphQL — живим тестом 2026-06-10 (повний дамп + мінімальний
> запит без кукі), HTML — аналізом робочого коду `lerdem/olx-parser` (UA, Python) та
> `l-margiela/olx-mcp` (UA, TS) і власним сканом.

### 4.1 Основний шлях — GraphQL API

Фронтенд OLX тягне видачу через `POST https://www.olx.ua/apigateway/graphql`
(query `ListingSearchQuery` → `clientCompatibleListings(searchParameters)`).
Підтверджено: працює **без кукі, без Authorization, без токенів**; range-фільтри
(`{key: "filter_float_price:from", value: "8000"}`) працюють; пагінація `offset`/`limit`.

Переваги над HTML: ціна числом + валюта, дати в ISO (`created_time` → сортовний `posted_at`),
`params` (характеристики) і `description` вже у списковій видачі, ознака `business`,
жодних CSS-селекторів (нема класу поломок «OLX поміняв розмітку»).

**Усі деталі запиту/відповіді, таблиця ключів `searchParameters`, маппінг полів у БД —
[`olx-api.md`](./olx-api.md) §2 (канон для реалізації).** Реалізація:
`server/src/scraper/graphqlOlxFetcher.ts`.

Існує також REST-дзеркало `https://www.olx.ua/api/v1/offers?offset=&limit=&query=...`
(видно в `links` GraphQL-відповіді) — підтверджено для olx.ua; використовуємо GraphQL-варіант.

### 4.1-bis Fallback №1 — static HTML fetch + parse

`lerdem/olx-parser` тягне дані звичайним `requests.get()` (UA реального браузера) і парсить **server-rendered HTML** через lxml — без браузера, без JS-рендерингу. Це підтверджує: проста GET-сторінка пошуку вже містить картки оголошень. Найлегший варіант, добре йде на Orange Pi. Scanner вмикає цей шлях автоматично, якщо GraphQL-запит упав.

```
GET https://www.olx.ua/d/uk/list/q-macbook-air/
  ?currency=UAH
  &search[order]=created_at:desc
  &search[filter_float_price:from]=15000
  &search[filter_float_price:to]=35000
  &search[private_business]=private        // опційно: тільки приватні
  &view=list
```

Заголовки (з робочого коду lerdem):
```
User-Agent: Mozilla/5.0 (Windows NT 10.0; rv:91.0) Gecko/20100101 Firefox/91.0
Referer: <той самий url>
X-Client: DESKTOP
```

**Парсинг (cheerio), селектори підтверджені в обох проектах:**

| Поле | Селектор |
| --- | --- |
| Картка | `[data-cy="l-card"]` |
| Назва | `[data-cy="l-card"] h6` (або `h4`) |
| Ціна | `[data-testid="ad-price"]` (напр. `"6 000 грн."` → нормалізувати) |
| Лінк | `[data-cy="l-card"] a[href]` (відносний → префікс `https://www.olx.ua`) |
| Дата/локація | `[data-testid="location-date"]` |
| Порожня видача | `[data-cy="empty-state"]` |
| Характеристики (detail) | `[data-cy="ad-params"] li` |
| Опис (detail) | `[data-testid="ad_description"]` |
| Тип продавця | `[data-testid="trader-title"]` (бізнес) |
| Фото CDN | `ireland.apollo.olxcdn.com/v1/files/{id}/image;s=WxH` |

**Правила ввічливості:**
- Звичайний скан: затримка 1–2 с між сторінками, ≤3 сторінки на пошук.
- Глибокий скан (ручна кнопка/CLI `--deep`, `?deep=true`): батчі по 3 запити
  (`BATCH_SIZE`) з паузою 3–6 с між батчами, ціль `min(50, ceil(visible_total_count/40))`
  запитів, рання зупинка при сторінці `<40` елементів. Прогрес пишеться у
  `scan_runs.requests_done`/`requests_total` і віддається через
  `GET /api/searches/:id/scan-status` (деталі — `olx-api.md` §2.9).

Scraper — окремий модуль за інтерфейсом, щоб міняти стратегію без зачіпання решти:

```ts
interface OlxFetcher {
  fetchSearch(search: SearchConfig): Promise<RawListing[]>;       // список
  fetchDetail?(url: string): Promise<RawListingDetail>;           // опц.: характеристики
}
```

### 4.2 Подальші fallback (якщо і GraphQL, і static HTML віддають порожнечу)

1. Перевірити `__PRERENDERED_STATE__` / `__NEXT_DATA__` у `<script>` сторінки (JSON всередині, без рендерингу JS).
2. Крайній випадок — Playwright з **видимим** Chromium (досвід `sekondly` + `olx-mcp`: headless блокується). Тільки локально на потужнішій машині, не на Pi.

Порядок стратегій: GraphQL → HTML+cheerio (автоматично) → `__NEXT_DATA__` → Playwright headed
(останні два — рішення людини). Зміна стратегії = нова реалізація інтерфейсу `OlxFetcher`.

### 4.3 Діапазони характеристик (range-фільтри)

Два рівні (обидва серверні формати підтверджені живими запитами):
- **Серверні фільтри OLX:**
  - GraphQL (основний): елементи `searchParameters` — `{key: "filter_float_<name>:from", value: "<число>"}` / `:to`; enum: `filter_enum_<name>[0]`; значення завжди рядками. ✅ Верифіковано для `price`.
  - HTML-URL (fallback): `search[filter_float_<name>:from]=` / `:to]=` для числових, `search[filter_enum_<name>][0]=` для категорійних, `search[private_business]=private`.
- **Локальні range-правила** — `searches.local_filters` (JSON), застосовуються Normalizer'ом до розпарсених `params`. Приклад: `{"ram_gb": {"min": 8, "max": 16}, "exclude_keywords": ["на запчастини", "розбитий"]}`. Поза діапазоном → `filtered_out=1` (зберігається, але приховане).

---

## 5. Схема БД

```sql
CREATE TABLE searches (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,                -- "MacBook Air M1/M2 Київ"
  query TEXT NOT NULL,
  category_id INTEGER,
  api_filters TEXT DEFAULT '{}',     -- JSON: серверні фільтри OLX
  local_filters TEXT DEFAULT '{}',   -- JSON: range-правила + стоп-слова
  cron_enabled INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE listings (
  id INTEGER PRIMARY KEY,
  olx_id INTEGER NOT NULL UNIQUE,    -- ключ дедуплікації
  search_id INTEGER REFERENCES searches(id),
  title TEXT, url TEXT,
  price REAL, currency TEXT DEFAULT 'UAH',
  city TEXT, district TEXT,
  params TEXT DEFAULT '{}',          -- JSON: всі характеристики з OLX
  photo_url TEXT,
  seller_type TEXT,                  -- private | business
  posted_at TEXT,
  status TEXT DEFAULT 'new'
    CHECK (status IN ('new','interested','contacted','disabled')),
  status_source TEXT DEFAULT 'auto', -- auto | manual
  note TEXT DEFAULT '',
  filtered_out INTEGER DEFAULT 0,
  first_seen_at TEXT DEFAULT (datetime('now')),
  last_seen_at TEXT
);

CREATE TABLE price_history (
  id INTEGER PRIMARY KEY,
  listing_id INTEGER REFERENCES listings(id),
  price REAL NOT NULL,
  observed_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE scan_runs (
  id INTEGER PRIMARY KEY,
  search_id INTEGER REFERENCES searches(id),
  started_at TEXT, finished_at TEXT,
  found INTEGER, new_count INTEGER, disabled_count INTEGER,
  error TEXT,
  requests_done INTEGER DEFAULT 0,   -- прогрес глибокого скану: виконано запитів
  requests_total INTEGER             -- прогрес глибокого скану: ціль (NULL поки невідома)
);
```

---

## 6. Статусна логіка

```mermaid
stateDiagram-v2
    [*] --> new : знайдено при скануванні
    new --> interested : вручну
    interested --> contacted : вручну
    new --> disabled : auto (зникло з видачі)
    interested --> disabled : auto / вручну
    contacted --> disabled : auto / вручну
    disabled --> new : auto-reactivate (з'явилося знову)
```

**Auto-disable:** після сканування — усі listings цього search, чий `olx_id` відсутній у свіжій видачі І `last_seen_at` старший за 2 послідовні скани → `status='disabled', status_source='auto'`. (Буфер у 2 скани захищає від хибних спрацювань при збоях API.)

**Ручний override:** якщо `status_source='manual'` і статус `disabled` — auto-логіка його не реактивує.

---

## 7. REST API бекенду

| Метод | Шлях | Дія |
| --- | --- | --- |
| `GET/POST/PATCH/DELETE` | `/api/searches[/:id]` | CRUD пошуків |
| `POST` | `/api/searches/:id/scan` | Запустити сканування (повертає звіт scan_run) |
| `GET` | `/api/searches/:id/listings?status=&sort=` | Таблиця оголошень |
| `PATCH` | `/api/listings/:id` | `{status?, note?}` — інлайн-редагування |
| `GET` | `/api/listings/:id/price-history` | Дані для спарклайну |
| `POST` | `/api/searches/:id/export/notion` | Експорт/синк у Notion |
| `GET` | `/api/listings/:id/export/markdown` | MD-вивантаження для аналізу в Claude |

---

## 8. Frontend (React)

**Сторінки:**
1. **Searches** — список пошуків, кнопки Scan / Edit / cron toggle, статистика останнього скану.
2. **Listings table** (головна) — TanStack Table:
   - Колонки: фото-мініатюра, назва (лінк на OLX), ціна + Δ ціни (стрілка ↓↑ + спарклайн), ключові характеристики (динамічно з `params`), місто, дата, статус (dropdown), нотатка (інлайн textarea).
   - Фільтри: статус, ціновий діапазон, текстовий пошук; toggle "показати filtered_out".
   - Сортування по будь-якій колонці. Bulk-дії: змінити статус для виділених.
   - Рядки `disabled` — приглушені (opacity).
3. **Listing detail** (drawer) — повний опис, усі params, графік ціни, нотатка.

**Search editor:** форма query + категорія + динамічний конструктор range-фільтрів (поле / min / max) + стоп-слова.

---

## 9. Notion-експорт

- Internal integration token у `.env` (`NOTION_TOKEN`, `NOTION_PARENT_PAGE_ID`).
- Перший експорт: створення Notion database з properties: Title, Price (number), Status (select — мапиться 1:1), City, URL, Note, Posted, Δ Price.
- Повторний: синк за `olx_id` (зберігається як property) — update існуючих, create нових.
- Напрямок **тільки app → Notion** (one-way). Двосторонній синк — поза скоупом v1 (конфлікти не варті складності).

---

## 10. Аналіз через Claude Pro

Ендпойнт `/export/markdown` віддає вибрані оголошення у компактному MD (таблиця + описи) — копіюєш у Claude для семантичного аналізу ("відкинь биті, порівняй, поранжуй"). Без LLM у пайплайні = нуль витрат API, повний контроль.

---

## 11. Структура проекту

```
olx-monitor/
├── CLAUDE.md
├── package.json              # workspaces: server, web
├── server/
│   ├── src/
│   │   ├── index.ts           # Fastify bootstrap
│   │   ├── db/{schema.sql, db.ts}
│   │   ├── scraper/{olxApiFetcher.ts, normalizer.ts, statusEngine.ts}
│   │   ├── routes/{searches.ts, listings.ts, export.ts}
│   │   ├── notion/exporter.ts
│   │   └── cron.ts
│   └── data/olx.db            # gitignored
└── web/
    ├── src/
    │   ├── pages/{Searches.tsx, ListingsTable.tsx}
    │   ├── components/{StatusSelect, NoteCell, PriceSparkline, SearchEditor, ListingDrawer}
    │   └── api/client.ts      # TanStack Query hooks
    └── vite.config.ts
```

---

## 12. Етапи реалізації

| Етап | Скоуп | Критерій готовності |
| --- | --- | --- |
| **MVP (1)** | Scraper (API fetcher) + SQLite + ручний scan через CLI/endpoint + сира таблиця в React | Бачиш 100 оголошень у таблиці, дедуплікація працює |
| **2** | Статуси (ручні + auto-disable), нотатки, інлайн-едіт, локальні range-фільтри | Повний робочий цикл моніторингу |
| **3** | Price history + спарклайни, MD-експорт для Claude | Бачиш динаміку цін |
| **4** | Notion-експорт, node-cron, scan_runs журнал | "Set and forget" |

---

## 13. Ризики

| Ризик | Мітигація |
| --- | --- |
| OLX змінить GraphQL-схему / HTML-розмітку | Інтерфейс `OlxFetcher` ізолює стратегію; автоматичний fallback GraphQL→HTML у scanner; селектори в одному місці; далі `__NEXT_DATA__`, Playwright headed; діагностика — чекліст `olx-api.md` §5 |
| Rate-limit / бан IP | Звичайний скан: затримки 1–2 с, ≤3 стор./пошук, реалістичний UA, сканування рідке. Глибокий скан (ручний): батчі по 3 з паузою 3–6 с, абсолютний ліміт 50 запитів |
| Зміна структури `params` між категоріями | `params` зберігається сирим JSON; колонки таблиці — динамічні |
| Хибний auto-disable (збій одного скану) | Буфер 2 послідовні скани + auto-reactivate |
