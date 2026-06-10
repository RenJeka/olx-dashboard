# CLAUDE.md — olx-monitor

Персональна система моніторингу оголошень OLX.ua: збір → SQLite → React-таблиця зі статусами/нотатками/історією цін, експорт у Notion. Single-user, локальний запуск.

## Стек (не відхилятися без явного запиту)

- **Monorepo:** npm workspaces — `server/` + `web/`.
- **Backend:** Node.js 20+, TypeScript, **Fastify**, **better-sqlite3** (синхронний), **cheerio** (парсинг), **node-cron** (опц.).
- **Frontend:** React 18 + **Vite** + **TanStack Table v8** + **TanStack Query v5** + **Tailwind**.
- **Notion:** `@notionhq/client`.
- НЕ використовувати: Express, Prisma/ORM, PostgreSQL, Redux, Playwright у MVP.

## Метод збору даних (КРИТИЧНО — підтверджено робочим кодом)

- Основний: **звичайний `fetch` на URL пошуку OLX → парсинг server-rendered HTML через cheerio.** БЕЗ браузера/Playwright.
- Заголовки запиту обовʼязкові:
  ```
  User-Agent: Mozilla/5.0 (Windows NT 10.0; rv:91.0) Gecko/20100101 Firefox/91.0
  Referer: <той самий url>
  X-Client: DESKTOP
  ```
- URL пошуку: `https://www.olx.ua/d/uk/list/q-<query-slug>/?currency=UAH&search[order]=created_at:desc&view=list`
- Range-фільтри йдуть **у URL**: `search[filter_float_<name>:from]=`, `:to]=`; enum: `search[filter_enum_<name>][0]=`; `search[private_business]=private`.
- Селектори (підтверджені, тримати в одному файлі `server/src/scraper/selectors.ts`):
  - картка `[data-cy="l-card"]`, назва `h6, h4` (OLX мігрував заголовок з `h6` на `h4` — тримати обидва), ціна `[data-testid="ad-price"]`, лінк `a[href]` (відносний → префікс `https://www.olx.ua`), дата/локація `[data-testid="location-date"]`, порожньо `[data-cy="empty-state"]`.
  - detail: характеристики `[data-cy="ad-params"] li`, опис `[data-testid="ad_description"]`, бізнес `[data-testid="trader-title"]`.
- Ввічливість: 1–2 с затримка між сторінками, **≤3 сторінки** на пошук.
- Scraper за інтерфейсом `OlxFetcher` — щоб міняти стратегію (HTML → `__NEXT_DATA__` → Playwright) не чіпаючи решту.
- НЕ використовувати `api/v1/offers/` — для olx.ua не підтверджено.

## Схема БД

Канонічна схема — у `server/src/db/schema.sql`. Таблиці: `searches`, `listings`, `price_history`, `scan_runs`. Не дублювати визначення в коді — читати/застосовувати з SQL-файлу при старті.

Ключові інваріанти:
- `listings.olx_id` UNIQUE — ключ дедуплікації (upsert по ньому).
- `status` ∈ `new|interested|contacted|disabled` (CHECK у схемі).
- `status_source` ∈ `auto|manual`.
- `params` — сирий JSON (характеристики різняться між категоріями; колонки UI динамічні).

## Бізнес-логіка (інваріанти, не порушувати)

- **Upsert:** новий `olx_id` → insert (`status='new'`). Існуючий → update полів + `last_seen_at`; якщо ціна змінилась — рядок у `price_history`.
- **Auto-disable:** після скану listings цього search, відсутні у свіжій видачі **2 скани поспіль** → `status='disabled', status_source='auto'`. Буфер у 2 скани обовʼязковий (захист від збою API).
- **Ручний override:** якщо `status_source='manual'` — auto-логіка НЕ перетирає статус.
- **Auto-reactivate:** зникле й знову зʼявлене (якщо не manual-disabled) → назад у `new`.
- **filtered_out:** локальні range-правила ставлять прапорець, НЕ видаляють рядок.
- **Notion-синк:** one-way (app → Notion), match по `olx_id`. Двосторонній — поза скоупом.

## Команди

```bash
npm run dev          # server (Fastify, :3001) + web (Vite, :5173) паралельно
npm run dev:server
npm run dev:web
npm run build
npm run scan -- --search <id>   # CLI-скан без UI (для крону/дебагу)
```

## Конвенції

- TypeScript strict. Без `any` у доменних типах (scraper/db/logic).
- Доменні типи — `server/src/types.ts`, шарити з web через простий import чи дублювання DTO (без складних build-зчеплень).
- Помилки скрейпінгу не валять процес: лог у `scan_runs.error`, скан позначається failed, попередні дані лишаються.
- Секрети (`NOTION_TOKEN`, `NOTION_PARENT_PAGE_ID`) — лише в `.env`, ніколи в код/git. `server/data/*.db` — gitignored.
- Коментарі та UI-текст — українською; код/ідентифікатори — англійською.
- Після реалізації змін пропонувати текст git commit повідомлення (тільки текст).

## Документація

- `docs/architecture.md` — технічна архітектура, потік даних, модулі, стан API.
- `docs/structure.md` — дерево файлів/папок і орієнтири «куди дивитись».
- `docs/olx-monitor-spec.md` — канонічна специфікація (вимоги, схема БД §5, етапи, ризики).
- `docs/plans/initial-mvp.md` — план Етапу 1 із прогресом.
- Після зміни коду, що додає файли/пакети/скрипти/ендпойнти — оновлювати `docs/architecture.md` і `docs/structure.md`.

## Етапи (рухатись по черзі, не забігати вперед)

1. ✅ **MVP (зроблено):** OlxFetcher (HTML+cheerio) + schema + upsert + `POST /searches/:id/scan` + сира React-таблиця. Спільна логіка скану — `server/src/scanner.ts` (роут + CLI).
2. Статуси (ручні + auto-disable) + нотатки + інлайн-едіт + локальні range-фільтри.
3. price_history + спарклайни + MD-експорт для аналізу в Claude.
4. Notion-експорт + node-cron + журнал scan_runs.

## Що питати перед дією

- Якщо OLX-розмітка не парситься — НЕ переходити одразу на Playwright; спершу перевірити `__NEXT_DATA__` і показати мені зразок HTML.
- Зміни стеку/схеми/інваріантів вище — лише після підтвердження.
