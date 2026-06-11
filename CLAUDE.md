# CLAUDE.md — olx-monitor

Персональна система моніторингу оголошень OLX.ua: збір → SQLite → React-таблиця зі статусами/нотатками/історією цін, експорт у Notion. Single-user, локальний запуск.

## Стек (не відхилятися без явного запиту)

- **Monorepo:** npm workspaces — `server/` + `web/`.
- **Backend:** Node.js 20+, TypeScript, **Fastify**, **better-sqlite3** (синхронний), **cheerio** (парсинг), **node-cron** (опц.).
- **Frontend:** React 18 + **Vite** + **TanStack Table v8** + **TanStack Query v5** + **Chakra UI v3** (`@chakra-ui/react`, провайдер/тостер/тултіп — сніпети у `web/src/components/ui/`).
- **Іконки:** `react-icons/lu` (набір Lucide) — стандартний вибір для Chakra UI v3.
- **Notion:** `@notionhq/client`.
- НЕ використовувати: Express, Prisma/ORM, PostgreSQL, Redux, Playwright у MVP.

## Метод збору даних (КРИТИЧНО — підтверджено живими запитами 2026-06-10)

- **Основний: GraphQL** — `POST https://www.olx.ua/apigateway/graphql`, query `ListingSearchQuery` → `clientCompatibleListings(searchParameters)`. Працює **без кукі, без auth, без токенів**. Дає ціну числом, ISO-дати, `params`, `business`. Усі деталі (заголовки, body, ключі `searchParameters`, приклади, маппінг полів у БД) — у `docs/olx-api.md` §2; реалізація — `server/src/scraper/graphqlOlxFetcher.ts`.
- Range-фільтри GraphQL: `searchParameters` елемент `{key: "filter_float_<name>:from|:to", value: "<число-рядком>"}` (верифіковано для `price`).
- **Fallback №1: HTML** — `fetch` на URL пошуку `https://www.olx.ua/d/uk/list/q-<slug>/?...` → парсинг server-rendered HTML через cheerio (`server/src/scraper/olxFetcher.ts`). Scanner вмикає його автоматично при падінні GraphQL. БЕЗ браузера/Playwright. Деталі URL/заголовків — `docs/olx-api.md` §3.
- Селектори HTML-fallback (тримати в одному файлі `server/src/scraper/selectors.ts`):
  - картка `[data-cy="l-card"]`, назва `h6, h4` (OLX мігрував заголовок з `h6` на `h4` — тримати обидва), ціна `[data-testid="ad-price"]`, лінк `a[href]` (відносний → префікс `https://www.olx.ua`), дата/локація `[data-testid="location-date"]`, порожньо `[data-cy="empty-state"]`.
  - detail: характеристики `[data-cy="ad-params"] li`, опис `[data-testid="ad_description"]`, бізнес `[data-testid="trader-title"]`.
- Ввічливість (обидва методи, **звичайний скан**): 1–2 с затримка між запитами/сторінками, **≤3 запити** на скан.
- **Глибокий скан** (ручна кнопка «Глибокий скан» в UI поруч зі «Сканувати», або CLI `--deep`) —
  одноразовий поглиблений прохід для нарощування покриття БД: батчі по 3 запити (як звичайний
  скан), пауза **3–6 с** між батчами, ціль `min(50, ceil(visible_total_count / 40))` запитів
  (`50` — абсолютний запобіжник). Рання зупинка, якщо сторінка повернула `< 40`/порожньо —
  як і в звичайному скані. Прогрес (`requests_done`/`requests_total` у `scan_runs`) пишеться
  через `FetchOptions.onProgress` і віддається `GET /api/searches/:id/scan-status` для
  поллінгу фронтендом. Деталі — `docs/olx-api.md` §2.9.
- Усі стратегії — за інтерфейсом `OlxFetcher` (`server/src/types.ts`, `fetchSearch(search, options?: FetchOptions)`);
  подальші fallback (`__NEXT_DATA__` → headed Playwright) — лише за рішенням людини.
- REST `api/v1/offers/` існує (дзеркало GraphQL, видно в `links` відповіді) — використовуємо GraphQL-варіант.
- Dataflow фронтенду OLX (знято live 2026-06-11, деталі — `docs/olx-api.md` §2.10): перше завантаження сторінки пошуку — SSR (оголошення вже в HTML/`__NEXT_DATA__`, GraphQL НЕ викликається); GraphQL спрацьовує лише при клієнтських діях (фільтр/сортування/пагінація). «Підготовчих» запитів GraphQL не потребує — супутні `friendly-links`/`offers/metadata` це косметика UI сайту.

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
- Доменні типи — `server/src/types.ts`, типи фронтенду — `web/src/types/index.ts`. Шарити між беком і фронтом через дублювання DTO (без складних build-зчеплень).
- Помилки скрейпінгу не валять процес: лог у `scan_runs.error`, скан позначається failed, попередні дані лишаються.
- Секрети (`NOTION_TOKEN`, `NOTION_PARENT_PAGE_ID`) — лише в `.env`, ніколи в код/git. `server/data/*.db` — gitignored.
- Коментарі та UI-текст — українською; код/ідентифікатори — англійською.
- Після реалізації змін пропонувати текст git commit повідомлення ангійською мовою (тільки текст).

## Документація

- `docs/architecture.md` — технічна архітектура, потік даних, модулі, стан API.
- `docs/olx-api.md` — деталі запитів до OLX (URL/параметри/заголовки/селектори/fallback); оновлювати при будь-якій зміні розмітки чи параметрів OLX.
- `docs/structure.md` — дерево файлів/папок і орієнтири «куди дивитись».
- `docs/olx-monitor-spec.md` — канонічна специфікація (вимоги, схема БД §5, етапи, ризики).
- `docs/plans/initial-mvp.md` — план Етапу 1 із прогресом.
- `docs/plans/graphql-migration.md` — план міграції збору на GraphQL (інструкція для виконавця).
- Плани нових фіч/задач — завжди створювати/оновлювати в `docs/plans/<назва>.md` за форматом наявних файлів (контекст → файли → кроки з чекбоксами → test-cases). Створювати файл плану ПЕРШИМ кроком, до початку правок коду.
- Після зміни коду, що додає файли/пакети/скрипти/ендпойнти — оновлювати `docs/architecture.md` і `docs/structure.md`.

## Етапи (рухатись по черзі, не забігати вперед)

1. ✅ **MVP (зроблено):** OlxFetcher (HTML+cheerio) + schema + upsert + `POST /searches/:id/scan` + React-таблиця. Спільна логіка скану — `server/src/scanner.ts` (роут + CLI). Доповнення: міграція збору на GraphQL (`GraphqlOlxFetcher` основний, HTML — fallback) — див. `docs/plans/graphql-migration.md`; міграція UI на Chakra UI v3 + Drawer налаштувань (тема, видимість колонок) + колонки «Опис»/«Продавець»/«Статус OLX» і лічильник «Результатів: N».
2. Статуси (ручні + auto-disable) + нотатки + інлайн-едіт + локальні range-фільтри.
3. price_history + спарклайни + MD-експорт для аналізу в Claude.
4. Notion-експорт + node-cron + журнал scan_runs.

## Що питати перед дією

- Якщо GraphQL почав падати — діагностика за чеклістом `docs/olx-api.md` §5 (HTML-fallback вмикається автоматично); НЕ переходити одразу на Playwright; спершу перевірити `__NEXT_DATA__` і показати мені зразок HTML.
- Зміни стеку/схеми/інваріантів вище — лише після підтвердження.
