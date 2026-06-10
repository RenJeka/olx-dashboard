# План: міграція збору даних на GraphQL API OLX

> Прогрес: познач `[x]` коли пункт виконано. Легенда: `[ ]` — заплановано, `[~]` — у роботі, `[x]` — готово.
>
> **Для виконавця:** це головна інструкція. Усі деталі запиту/відповіді GraphQL (ендпойнт,
> заголовки, body, приклади, маппінг полів) — у [`../olx-api.md`](../olx-api.md). Інваріанти,
> які не можна порушувати, — у [`../../CLAUDE.md`](../../CLAUDE.md). Нічого не вигадуй поза
> цими двома файлами; якщо чогось бракує — зупинись і спитай.

## Context

Знайдено й верифіковано живим тестом (2026-06-10) GraphQL-ендпойнт, яким користується сам
фронтенд OLX: `POST https://www.olx.ua/apigateway/graphql`. Працює **без кукі, без auth,
без токенів**; range-фільтри працюють; відповідь дає ціну числом, ISO-дати, `params`,
ознаку бізнес-продавця.

Рішення: GraphQL стає **основною** стратегією збору, наявний `HtmlOlxFetcher` (HTML+cheerio)
лишається **fallback №1**. Архітектура до цього готова: обидва фетчери реалізують інтерфейс
`OlxFetcher` (`server/src/types.ts`); схема БД, роути, web — не змінюються.

Вигоди: `posted_at` стає сортовним ISO-рядком (зараз — сирий текст «Сьогодні о 06:19»),
`params` заповнюється вже на списковій видачі (основа Етапів 2–3), зникає клас поломок
«OLX поміняв CSS-селектор».

## Група A — Реалізація (server/)

### A1. Типи — `server/src/types.ts`

- [x] Розширити `RawListing` опційними структурованими полями (GraphQL-фетчер їх заповнює,
  HTML-фетчер — ні; normalizer віддає їм пріоритет):
  - `price?: number | null`, `currency?: string`
  - `createdAt?: string` (ISO), `lastRefreshAt?: string` (ISO)
  - `city?: string`, `district?: string`
  - `sellerType?: 'private' | 'business'`
  - `params?: Record<string, string>` (key → label; плаский JSON для колонки `listings.params`)

### A2. Новий фетчер — `server/src/scraper/graphqlOlxFetcher.ts`

- [x] `class GraphqlOlxFetcher implements OlxFetcher` (метод `fetchSearch(search: SearchConfig)`):
  - [x] Константа `GRAPHQL_URL = 'https://www.olx.ua/apigateway/graphql'`; **скорочений**
    GraphQL-query `ListingSearchQuery` — точний текст і робочий приклад body є в
    [`../olx-api.md` §2.4](../olx-api.md). Поля: `id, title, url, status, created_time,
    last_refresh_time, business, location{city{name} district{name}}, photos{link},
    params{key name type value{... on PriceParam{value currency label} ... on GenericParam{key label}}}`
    + `metadata{total_elements}` + гілка `... on ListingError{error{code title detail}}`.
  - [x] Заголовки запиту — таблиця в [`../olx-api.md` §2.3](../olx-api.md). Без кукі.
  - [x] `searchParameters` з `SearchConfig` — мапінг у [`../olx-api.md` §2.2](../olx-api.md):
    `query`, `offset`, `limit: "40"`, ranges → `filter_float_<name>:from/:to`,
    enums → `filter_enum_<name>[0]` (best-effort), `privateOnly` → `owner_type=private` (best-effort).
  - [x] Пагінація: offset 0/40/80, **≤3 запити**, затримка 1–2 с між ними (патерн
    `sleep`+random як у `olxFetcher.ts`); стоп якщо повернулось < 40 або 0.
  - [x] Маппінг відповіді → `RawListing[]`: olxId=`id`; ціна з елемента `params` з
    `key==="price"` (PriceParam → `value`, `currency`; немає → `price: null`); фото —
    `photos[0].link` із заміною літерального плейсхолдера `{width}x{height}` на `400x300`;
    `params` → плаский обʼєкт `{key: label}`; `business` → `sellerType`.
  - [x] Помилки: HTTP ≠ 200, поле `errors[]` у JSON-відповіді, або
    `__typename === 'ListingError'` → кидати `Error` з деталями (його зловить `scanner.ts`).

### A3. Normalizer — `server/src/scraper/normalizer.ts`

- [x] В `upsertListings`: якщо структуровані поля присутні — використовувати їх
  (`price`/`currency` напряму; `posted_at` ← `createdAt`; `city`; `district`;
  `seller_type` ← `sellerType`; `params` → `JSON.stringify`). Якщо ні — існуючий шлях
  `parsePrice`/`parseLocationDate` (HTML fallback). Поведінку для HTML-фетчера НЕ ламати.
- [x] Розширити UPSERT колонками `district`, `seller_type`, `params` (колонки в схемі вже є).
- [x] `price_history` і `filtered_out` як і раніше НЕ чіпати (Етапи 2–3).

### A4. Scanner — `server/src/scanner.ts`

- [x] Основний фетчер — `GraphqlOlxFetcher`. Якщо він кинув помилку — **автоматичний
  fallback** на `HtmlOlxFetcher` у тому ж скані.
- [x] Якщо спрацював fallback — скан успішний, але в `scan_runs.error` записати позначку
  виду `graphql failed: <msg>; fallback html OK`.
- [x] Падіння обох фетчерів → існуюча поведінка (повна помилка в `scan_runs.error`,
  HTTP 500, процес живий).

## Група B — Документація (виконано заздалегідь, звірити після реалізації)

- [x] `docs/olx-api.md` — переписано: GraphQL основний метод, HTML — fallback №1
- [x] `CLAUDE.md` — канон оновлено (GraphQL-first)
- [x] `docs/olx-monitor-spec.md` — §3/§4/§13 оновлено
- [x] `docs/architecture.md` — потік даних, модулі, fallback-ланцюжок
- [x] `docs/structure.md` — додано `graphqlOlxFetcher.ts`
- [x] `.gitignore` — `.temp/` заігнорена (дампи містять живі кукі — НЕ комітити)
- [x] Після реалізації: звірити, що опис модулів в `architecture.md`/`structure.md`
  відповідає фактичному коду (імена файлів/класів)

## Верифікація

- [x] `npm run build` — без помилок (server tsc + web tsc/vite)
- [x] Запустити server (`npm run dev:server`), `POST /api/searches/1/scan` →
  у відповіді `{found, new_count}`
- [x] У `listings`: `posted_at` — ISO-формат (`2026-…T…`), `params` — непорожній JSON,
  `seller_type` заповнений, `price` числом
- [x] Повторний скан → `new_count` ≈ 0 (дедуплікація по `olx_id` не зламалась; реально
  4/151 — нормальний churn живої видачі OLX за ~хвилину між сканами)
- [x] Range-фільтр: пошук із price 8000–15000 → всі ціни в межах
- [x] Fallback: тимчасово зіпсувати `GRAPHQL_URL` (напр. `/apigateway/graphql-broken`) →
  скан проходить через HTML, у `scan_runs.error` — позначка fallback; повернути URL
- [x] CLI: `npm run scan -- --search 1`

## Коміт

Один коміт: `feat: GraphqlOlxFetcher — GraphQL як основна стратегія збору даних`
(гілка `feat/mvp-stage-1`). Після реалізації — запропонувати текст коміту користувачу.
