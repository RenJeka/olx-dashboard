# OLX.ua — API запитів

> Документація того, **що саме ми викликаємо на OLX, як, з якими параметрами і що отримуємо**.
> OLX не має публічного API — ми використовуємо неофіційний GraphQL-ендпойнт, яким користується
> сам фронтенд сайту (основний метод), і server-rendered HTML-сторінку пошуку (fallback).
> Якщо OLX щось поміняє — цей файл є базовою лінією «що було і працювало».
>
> Верифіковано живими запитами: **2026-06-10**.
>
> Повʼязане: [`architecture.md`](./architecture.md), [`olx-monitor-spec.md`](./olx-monitor-spec.md) §4,
> план міграції: [`plans/graphql-migration.md`](./plans/graphql-migration.md),
> повний довідник полів відповіді: [`olx-graphql-fields-reference.md`](./olx-graphql-fields-reference.md).

---

## 1. Стратегії збору (пріоритет)

| № | Метод | Статус | Код |
| --- | --- | --- | --- |
| 1 | **GraphQL** `POST /apigateway/graphql` | ✅ основний | `server/src/scraper/graphqlOlxFetcher.ts` |
| 2 | HTML-сторінка пошуку + cheerio | ✅ fallback №1 (автоматичний у scanner) | `server/src/scraper/olxFetcher.ts` |
| 3 | `__NEXT_DATA__` JSON зі сторінки | концепт (не реалізовано) | — |
| 4 | Playwright з видимим Chromium | крайній випадок, рішення людини | — |

Обидві реалізовані стратегії — за інтерфейсом `OlxFetcher` (`server/src/types.ts`).

> Існує також REST-дзеркало GraphQL: `https://www.olx.ua/api/v1/offers?offset=&limit=&query=...`
> (його видно в `links` GraphQL-відповіді). Підтверджено, що для olx.ua воно існує;
> ми використовуємо GraphQL-варіант, бо маємо для нього повний верифікований дамп.

---

## 2. GraphQL API (основний метод)

### 2.1 Ендпойнт

```
POST https://www.olx.ua/apigateway/graphql
Content-Type: application/json
```

Інфраструктура: CloudFront. Відповідь: `application/json`.

> ⚠️ **Introspection вимкнено** (перевірено живим запитом 2026-06-10): `__schema { ... }`
> повертає `200 OK`, але кожне introspection-поле дає помилку `GRAPHQL_VALIDATION_FAILED`
> ("GraphQL introspection has been disabled..."). Офіційну схему через `__schema`/`__type`
> отримати не можна — не витрачати на це час повторно. Каталог реально доступних полів
> (зібраний з live-дампів) — [`olx-graphql-fields-reference.md`](./olx-graphql-fields-reference.md).

### 2.2 Що НЕ потрібно (підтверджено живим тестом 2026-06-10)

Мінімальний `curl` **без усього нижче** повертає `200 OK` з повними даними:

- ❌ кукі (PHPSESSID, deviceGUID, аналітика) — не потрібні; сервер сам видає `set-cookie`,
  ігноруємо;
- ❌ `Authorization` — не потрібен (CORS дозволяє, але анонімний виклик працює);
- ❌ параметр `sl` — це трекінговий ідентифікатор (префікс кукі `onap`), опціональний;
- ❌ `region_id`/`city_id` — опціональні (без них пошук по всій Україні).

### 2.3 Заголовки, які ми шлемо

| Заголовок | Значення | Навіщо |
| --- | --- | --- |
| `Content-Type` | `application/json` | обовʼязковий |
| `Accept` | `application/json` | |
| `Accept-Language` | `uk` | українські назви міст/параметрів |
| `Origin` | `https://www.olx.ua` | імітація same-origin виклику фронтенду |
| `Referer` | `https://www.olx.ua/uk/list/q-<slug>/` | те саме |
| `X-Client` | `DESKTOP` | внутрішній заголовок OLX |
| `User-Agent` | реалістичний Chrome (див. дамп нижче) | |

UA з верифікованого дампа:
`Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36`

### 2.4 Тіло запиту

JSON: `{ "query": "<GraphQL query>", "variables": { "searchParameters": [...] } }`.

Query — `ListingSearchQuery` з полем `clientCompatibleListings(searchParameters: ...)`.
Скорочена робоча версія (саме вона перевірена live; повна версія фронтенду OLX тягне
значно більше полів — нам не потрібні):

```graphql
query ListingSearchQuery($searchParameters: [SearchParameter!] = []) {
  clientCompatibleListings(searchParameters: $searchParameters) {
    __typename
    ... on ListingSuccess {
      data {
        id
        title
        url
        status
        created_time
        last_refresh_time
        business
        location {
          city { name }
          district { name }
        }
        photos { link }
        params {
          key
          name
          type
          value {
            __typename
            ... on PriceParam { value currency negotiable label }
            ... on GenericParam { key label }
          }
        }
      }
      metadata { total_elements visible_total_count }
    }
    ... on ListingError {
      error { code title detail status }
    }
  }
}
```

### 2.5 `searchParameters` (ключ-значення)

Усі значення — **рядки**, навіть числа. Відомі ключі:

| Ключ | Приклад значення | Обовʼязковий? | Призначення |
| --- | --- | --- | --- |
| `query` | `"iphone 13"` | так (для пошуку за текстом) | пошуковий запит, plain text (НЕ slug) |
| `offset` | `"0"`, `"40"`, `"80"` | так | пагінація |
| `limit` | `"40"` | так | розмір сторінки (сайт використовує 40) |
| `filter_float_<name>:from` | `"8000"` | ні | нижня межа числового фільтра (`price` — універсальний) |
| `filter_float_<name>:to` | `"15000"` | ні | верхня межа ✅ верифіковано live |
| `filter_enum_<name>[0]` | `"5"` | ні | enum-фільтр (формат best-effort, НЕ верифіковано) |
| `owner_type` | `"private"` | ні | тільки приватні (best-effort, НЕ верифіковано) |
| `region_id` / `city_id` | `"25"` / `"268"` | ні | геофільтр (id з фасетів/URL сайту) |
| `suggest_filters` | `"true"` | ні | повертати `metadata.filter_suggestions` |
| `sl` | — | ні | трекінг-токен з кукі `onap`; **не передаємо** |

Приклад повного body (верифікований; збережений у `.temp/graphql-test-body.json`):

```json
{
  "query": "query ListingSearchQuery($searchParameters: [SearchParameter!] = []) { ... }",
  "variables": {
    "searchParameters": [
      { "key": "offset", "value": "0" },
      { "key": "limit", "value": "40" },
      { "key": "query", "value": "iphone 13" },
      { "key": "filter_float_price:from", "value": "8000" },
      { "key": "filter_float_price:to", "value": "15000" }
    ]
  }
}
```

### 2.6 Відповідь (high-level)

`200 OK`, JSON. Корінь: `data.clientCompatibleListings`. Дискримінатор — `__typename`:
`ListingSuccess` (дані) або `ListingError` (помилка валідації/запиту).

Скорочений приклад `ListingSuccess` (реальна відповідь live-тесту):

```json
{
  "data": {
    "clientCompatibleListings": {
      "__typename": "ListingSuccess",
      "data": [
        {
          "id": 925831122,
          "title": "Ipad Air 4 64 gb",
          "url": "https://www.olx.ua/d/uk/obyavlenie/ipad-air-4-64-gb-ID10EGY2.html",
          "status": "active",
          "created_time": "2026-06-09T15:54:50+03:00",
          "last_refresh_time": "2026-06-09T15:54:50+03:00",
          "business": false,
          "location": {
            "city": { "name": "Київ" },
            "district": { "name": "Оболонський" }
          },
          "photos": [
            { "link": "https://ireland.apollo.olxcdn.com:443/v1/files/31jncrvg67lt2-UA/image;s={width}x{height}" }
          ],
          "params": [
            {
              "key": "price", "name": "Ціна за 1 шт.", "type": "price",
              "value": { "__typename": "PriceParam", "value": 9000, "currency": "UAH",
                         "negotiable": false, "label": "9 000 грн." }
            },
            {
              "key": "state", "name": "Стан", "type": "select",
              "value": { "__typename": "GenericParam", "key": "used", "label": "Вживане" }
            }
          ]
        }
      ],
      "metadata": { "total_elements": 1000, "visible_total_count": 1124 }
    }
  }
}
```

Повний каталог усіх полів, які OLX фактично повертає (включно з тими, що наш query
не запитує) — категоризовано в [`olx-graphql-fields-reference.md`](./olx-graphql-fields-reference.md).
Коротко, найкорисніші додаткові поля (можна дотягнути за потреби):
`description` (повний опис у списковій видачі!), `user{name created is_online}`,
`promotion{top_ad highlighted}`, `delivery`, `map{lat lon}`, `metadata.promoted`
(індекси промо-оголошень у видачі), `links{next{href}}` (REST-дзеркало `api/v1/offers`),
`metadata.filter_suggestions` (доступні фільтри категорії — стане в пригоді для Етапу 2).

### 2.7 Маппінг полів у нашу БД (`listings`)

| GraphQL | Колонка БД | Примітка |
| --- | --- | --- |
| `id` | `olx_id` | число; ключ дедуплікації |
| `title` | `title` | |
| `url` | `url` | вже абсолютний |
| `params[key="price"].value.value` / `.currency` | `price` / `currency` | PriceParam; відсутній → `price=NULL` |
| `created_time` | `posted_at` | ISO — сортовний |
| `location.city.name` / `district.name` | `city` / `district` | |
| `photos[0].link` | `photo_url` | замінити `{width}x{height}` → конкретний розмір, напр. `400x300` |
| `business` | `seller_type` | `true`→`business`, `false`→`private` |
| `params[]` (без price) | `params` | плаский JSON `{key: label}` |

### 2.8 Помилки

- HTTP ≠ 200 — мережевий/інфраструктурний збій.
- `errors[]` на корені JSON — невалідний GraphQL (синтаксис query, невідомі поля).
- `__typename: "ListingError"` → `error{code title detail status, validation[]}` —
  невалідні `searchParameters`.

Усі три — кидати виняток; `scanner.ts` запише в `scan_runs.error` і (якщо доступний)
спробує HTML-fallback.

### 2.9 Пагінація і ввічливість

- `offset`/`limit`: сторінки 0/40/80. Ліміт у нас — **≤3 запити** на скан.
- Затримка **1–2 с** (рандомізована) між запитами.
- Стоп: повернулось менше `limit` елементів або 0.
- `metadata.total_elements` обрізається до 1000 — реальна кількість у `visible_total_count`.

> ⚠️ **Не плутати з `/api/searches/:id/listings`.** Ліміт «≤3 запити» вище — це
> ввічливість стосовно **OLX.ua** під час *збору* (`GraphqlOlxFetcher`/`HtmlOlxFetcher`,
> ≤120 сирих оголошень за скан). Наш власний `GET /api/searches/:id/listings`
> (`server/src/routes/listings.ts`) — **окрема річ**: SQL без `LIMIT/OFFSET`, повертає
> **всі** рядки `listings` для пошуку з нашої SQLite одним запитом/однією відповіддю,
> незалежно від їх кількості; query-параметри `limit`/`page` НЕ підтримуються (читаються
> лише `sort`/`order`). Перевірено живим запитом 2026-06-10: search із 173 рядками →
> 173 елементи, 82 КБ, в одній відповіді. Тобто кількість рядків у таблиці зростає з
> кожним сканом (накопичення в БД), а не з пагінацією видачі OLX.

---

## 3. HTML-сторінка пошуку (fallback №1)

> Працює, верифіковано; до 2026-06 був основним методом. Scanner вмикає його автоматично,
> якщо GraphQL-запит упав.

### 3.1 Запит

```
GET https://www.olx.ua/d/uk/list/q-<query-slug>/?<параметри>
```

- slug: lowercase, пробіли → `-`, URL-encode (`iphone 13` → `q-iphone-13`).
- Параметри: `currency=UAH`, `search[order]=created_at:desc`, `view=list`, `page=N` (N≥2),
  range: `search[filter_float_<name>:from]=`/`:to]=`, enum: `search[filter_enum_<name>][0]=`,
  `search[private_business]=private`. Дужки/двокрапки в іменах — літеральні.
- Заголовки (обовʼязкові): `User-Agent` (Firefox 91 — з робочого коду lerdem/olx-parser),
  `Referer` = той самий URL, `X-Client: DESKTOP`.

Приклад:

```
https://www.olx.ua/d/uk/list/q-iphone-13/?currency=UAH&search[order]=created_at:desc&view=list&search[filter_float_price:from]=8000&search[filter_float_price:to]=15000
```

### 3.2 Парсинг (cheerio, селектори — `server/src/scraper/selectors.ts`)

| Поле | Селектор | Примітки |
| --- | --- | --- |
| Картка | `[data-cy="l-card"]` | атрибут `id` = `olx_id` |
| Назва | `h6, h4` | ⚠️ OLX мігрував `h6`→`h4` (2026-06-10) |
| Ціна | `[data-testid="ad-price"]` | сирий текст `"13 500 грн."` → `parsePrice` |
| Лінк | `a[href]` (перший) | відносний → префікс `https://www.olx.ua` |
| Фото | `img` (перший, лише `http*`) | CDN `ireland.apollo.olxcdn.com` |
| Локація/дата | `[data-testid="location-date"]` | `"<Місто> - <дата>"`; дата — сирий текст, НЕ ISO |
| Порожня видача | `[data-cy="empty-state"]` | стоп пагінації |

Особливості: ~40–50 карток/сторінку, промо-дублі між сторінками (дедуплікація по `olxId`
у фетчері), картки без числового `id` — пропускаються, парсимо ТІЛЬКИ по
`data-cy`/`data-testid` (emotion-класи `css-*` нестабільні).

Обмеження проти GraphQL: дата — несортовний текст («Сьогодні о 06:19»), немає `params`,
ціну треба парсити з рядка.

Ввічливість: ≤3 сторінки, 1–2 с затримка, стоп на `empty-state`/0 карток/0 нових.

### 3.3 Guard

Якщо карток немає І немає `empty-state` — фетчер кидає виняток зі зразком перших 600
символів HTML + ознакою наявності `__NEXT_DATA__`. **НЕ** переходити на браузер автоматично.

---

## 4. Подальші fallback (не реалізовано, рішення людини)

1. **`__NEXT_DATA__`** — `<script id="__NEXT_DATA__">` на HTML-сторінці містить ті самі
   дані JSON-ом без JS-рендерингу.
2. **Playwright з видимим Chromium** (headless блокується) — крайній випадок, лише локально.

---

## 5. Чекліст «OLX щось поміняв»

1. Скан упав → дивись `scan_runs.error`:
   - `graphql failed: ...; fallback html OK` — GraphQL зламався, HTML витягнув. Розбери
     повідомлення: `ListingError` (помінялись параметри?) чи `errors[]` (помінялась схема —
     звір query §2.4 з актуальним у DevTools сайту).
   - повна помилка — впали обидва методи; у тексті буде зразок HTML від fallback.
2. GraphQL віддає 200, але поля `null` — схему розширили/перейменували; онови query.
3. HTML-fallback: картки є, поля порожні → звір селектори §3.2, онови `selectors.ts`.
4. Карток в HTML нема взагалі → перевір `__NEXT_DATA__` (§4.1).
5. Після фіксу — онови ЦЕЙ файл (журнал §6) і `CLAUDE.md`, якщо змінився канон.

> Як зняти свіжий дамп: DevTools → Network → фільтр `graphql` → пошук на сайті →
> Copy as cURL / Copy request payload. ⚠️ Дампи містять живі кукі сесії — зберігати
> лише в `.temp/` (gitignored), НЕ комітити.

---

## 6. Журнал змін OLX

| Дата | Зміна | Фікс |
| --- | --- | --- |
| 2026-06-10 | Заголовок HTML-картки `h6` → `h4` | селектор `h6, h4` у `selectors.ts` |
| 2026-06-10 | Відкрито GraphQL `/apigateway/graphql` (дамп + live-тест без кукі/auth: OK; `filter_float_price` працює). Підтверджено існування REST `api/v1/offers` для olx.ua | міграція: GraphQL — основний метод, HTML — fallback №1 (див. `plans/graphql-migration.md`) |
| 2026-06-10 | Підтверджено: introspection (`__schema`) на `/apigateway/graphql` вимкнено (`GRAPHQL_VALIDATION_FAILED`) | каталог полів зібрано вручну з live-дампів — `olx-graphql-fields-reference.md` |
