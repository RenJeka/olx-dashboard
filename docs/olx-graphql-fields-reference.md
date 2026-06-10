# OLX GraphQL — довідник полів `clientCompatibleListings`

> Introspection-запит до `https://www.olx.ua/apigateway/graphql` **вимкнено**
> (перевірено живим запитом 2026-06-10: `__schema { ... }` повертає `200 OK`,
> але кожне introspection-поле дає помилку `GRAPHQL_VALIDATION_FAILED`:
> *"GraphQL introspection has been disabled, but the requested query contained
> the field ..."*). Офіційну схему через `__schema`/`__type` отримати не можна.
>
> Цей файл — каталог полів, які OLX **фактично повертає** для одного елемента
> `clientCompatibleListings.data[]` (`ListingSuccess`), зібраний з живих дампів
> відповіді (`.temp/olx-response.json`, верифіковано 2026-06-10). `.temp/` —
> gitignored, тому цей файл — постійна копія знань про доступні поля.
>
> Робочий query (`server/src/scraper/graphqlOlxFetcher.ts`, див.
> [`olx-api.md`](./olx-api.md) §2.4) запитує лише підмножину нижче — будь-яке
> поле з цього каталогу можна додати в query за потреби (наприклад, для Етапу 2/3).
>
> Повʼязане: [`olx-api.md`](./olx-api.md) §2 (запит/відповідь/маппінг у БД).

---

## 1. Ідентифікація оголошення

| Поле | Тип / приклад | Опис |
| --- | --- | --- |
| `id` | `921249189` | Числовий ID оголошення → `listings.olx_id` (ключ дедуплікації) |
| `_nodeId` | base64-рядок | Внутрішній relay node id, не використовуємо |
| `url` | `https://www.olx.ua/d/uk/obyavlenie/...-ID....html` | Абсолютний лінк → `listings.url` |
| `status` | `"active"` | Статус оголошення на OLX |
| `offer_type` | `"offer"` | Тип офера |
| `external_url` | `string \| null` | Зовнішнє посилання (якщо продавець вказав) |
| `partner` | `null` | Партнерська інтеграція (не бачили заповненим) |
| `category.id` / `category.type` | `3731` / `"electronics"` | Категорія OLX |

## 2. Контент

| Поле | Тип / приклад | Опис |
| --- | --- | --- |
| `title` | рядок | Заголовок → `listings.title` |
| `description` | HTML-рядок з `<br />` | **Повний опис прямо у списковій видачі** — не треба ходити на сторінку оголошення |
| `photos[]` | масив | Усі фото оголошення |
| `photos[].link` | `https://ireland.apollo.olxcdn.com:443/v1/files/<id>-UA/image;s={width}x{height}` | URL-шаблон, `{width}x{height}` замінити на конкретний розмір (напр. `400x300`) |
| `photos[].width` / `.height` / `.rotation` | числа | Оригінальні розміри/поворот |

## 3. Ціна та характеристики (`params[]`)

Кожен елемент: `{ key, name, type, value }`. `value.__typename` визначає форму.

**`PriceParam`** (тип `price`, ключ зазвичай `"price"`):

| Поле | Приклад | Опис |
| --- | --- | --- |
| `value` | `13100` | Ціна числом → `listings.price` |
| `currency` | `"UAH"` | → `listings.currency` |
| `negotiable` | `true/false` | Чи торг |
| `arranged` | `true/false` | "Договірна" |
| `budget` | `true/false` | |
| `label` | `"13 100 грн."` | Готовий текст для UI |
| `converted_value` / `converted_currency` | `null` | Конвертація валюти (якщо є) |
| `type` | `"arranged"` | Підтип ціни |

**`GenericParam`** (усе інше — характеристики категорії):

| Поле | Приклад | Опис |
| --- | --- | --- |
| `key` | `"used"`, `"5"` | Код значення (часто потребує мапінгу) |
| `label` | `"Вживане"`, `"Apple"` | Людська назва — використовуємо напряму |

`params[]` без `price` → `listings.params` (плаский JSON `{key: label}`, див. [`olx-api.md`](./olx-api.md) §2.7).

## 4. Час (усе ISO 8601 — сортовне)

| Поле | Приклад | Опис |
| --- | --- | --- |
| `created_time` | `2026-04-22T15:44:06+03:00` | Дата публікації → `listings.posted_at` |
| `last_refresh_time` | `2026-06-07T16:34:30+03:00` | Останнє "підняття"/оновлення оголошення |
| `omnibus_pushup_time` | `2026-06-07T16:34:30+03:00` | Час останнього платного підняття (Omnibus-директива) |
| `valid_to_time` | `2026-06-21T15:44:06+03:00` | До коли оголошення активне |

## 5. Геолокація

| Поле | Приклад | Опис |
| --- | --- | --- |
| `location.city` | `{ id: 268, name: "Київ", normalized_name: "kiev" }` | → `listings.city` |
| `location.district` | `{ id: 9, name: "Оболонський", normalized_name: null }` | → `listings.district` |
| `location.region` | `{ id: 25, name: "Київська область", normalized_name: "ko" }` | Область (зараз не мапимо в БД) |
| `map.lat` / `map.lon` | `50.51015` / `30.50243` | Координати (з розмиттям) |
| `map.radius` / `map.zoom` / `map.show_detailed` | `2` / `12` / `false` | Параметри відображення на карті |

## 6. Продавець

| Поле | Приклад | Опис |
| --- | --- | --- |
| `business` | `true/false` | → `listings.seller_type` (`true`→`business`, `false`→`private`) |
| `user.id` / `.uuid` | число / uuid | Внутрішні ID продавця |
| `user.name` | рядок | Імʼя/назва продавця |
| `user.created` | ISO дата | Дата реєстрації на OLX |
| `user.last_seen` | ISO дата | Остання активність |
| `user.is_online` | `true/false` | Онлайн зараз |
| `user.company_name` | рядок | Назва компанії (для бізнес-акаунтів) |
| `user.verification.status` | `"none"`, ... | Статус верифікації продавця |
| `user.social_network_account_type` | `"facebook"` | Через що зареєстрований |
| `user.b2c_business_page` / `.other_ads_enabled` / `.banner_desktop` / `.banner_mobile` / `.logo` / `.logo_ad_page` / `.about` / `.photo` / `.businessProfiles` | — | Профіль продавця/магазину (у наших дампах переважно порожні/`null`) |
| `contact.phone` / `.chat` / `.courier` / `.negotiation` | `true/false` | Які канали звʼязку доступні |
| `contact.name` | рядок | Імʼя контактної особи |

## 7. Промо / комерція

| Поле | Приклад | Опис |
| --- | --- | --- |
| `promotion.top_ad` / `.highlighted` / `.urgent` | `true/false` | Типи піднять/виділень |
| `promotion.options[]` | `["bundle_premium"]` | Список активних опцій просування |
| `promotion.premium_ad_page` / `.b2c_ad_page` | `true/false` | Прапорці типу сторінки |
| `delivery.rock` | `{ active, mode, offer_id }` | Інтеграція доставки ("Розетка") |
| `safedeal.weight_grams` / `.allowed_quantity[]` | число / масив | Параметри безпечної угоди |
| `payAndShip.sellerPaidDeliveryEnabled` | `true/false` | Безкоштовна доставка від продавця |
| `protect_phone` | `true/false` | Прихований номер телефону |
| `shop.subdomain` | `string \| null` | Піддомен магазину (для бізнес-акаунтів) |
| `isGpsrAvailable` | `true/false` | GPSR-маркування (вимога ЄС) |

## 8. Метадані видачі (`clientCompatibleListings.metadata` / `.links`)

| Поле | Приклад | Опис |
| --- | --- | --- |
| `metadata.total_elements` | `1000` | Обрізається до 1000 |
| `metadata.visible_total_count` | `3188` | Реальна кількість результатів |
| `metadata.source.promoted[]` / `.organic[]` | масиви індексів | Які позиції у видачі — промо, які — органіка |
| `metadata.promoted[]` | масив індексів | Дублює `source.promoted` |
| `metadata.filter_suggestions[]` | масив | **Доступні фільтри категорії** з можливими значеннями — корисно для динамічних фільтрів (Етап 2) |
| `metadata.x_request_id` / `.search_id` | рядки | Трейсинг-ID запиту OLX |
| `metadata.search_suggestion` / `.facets` / `.new` | `null` (у наших дампах) | Не спостерігали заповненими |
| `links.next.href` | `https://www.olx.ua/api/v1/offers?offset=40&limit=40&...` | REST-дзеркало для наступної сторінки |
| `links.first` / `.previous` / `.self` | об'єкти `{ href }` / `null` | Інші посилання пагінації REST-дзеркала |

---

## 9. Санітизований приклад (один елемент `data[]`)

Реальний дамп з замінами PII (імена/ID користувача, опис, заголовок) на плейсхолдери.

```json
{
  "_nodeId": "<opaque base64 node id>",
  "id": 921249189,
  "location": {
    "city": { "id": 268, "name": "Київ", "normalized_name": "kiev" },
    "district": { "id": 9, "name": "Оболонський", "normalized_name": null },
    "region": { "id": 25, "name": "Київська область", "normalized_name": "ko" }
  },
  "last_refresh_time": "2026-06-07T16:34:30+03:00",
  "delivery": { "rock": { "active": false, "mode": null, "offer_id": null } },
  "created_time": "2026-04-22T15:44:06+03:00",
  "category": { "id": 3731, "type": "electronics" },
  "contact": {
    "courier": true,
    "chat": true,
    "name": "<контактне імʼя>",
    "negotiation": true,
    "phone": true
  },
  "business": true,
  "omnibus_pushup_time": "2026-06-07T16:34:30+03:00",
  "photos": [
    {
      "link": "https://ireland.apollo.olxcdn.com:443/v1/files/<file-id>-UA/image;s={width}x{height}",
      "height": 1787,
      "rotation": 0,
      "width": 1500
    }
  ],
  "promotion": {
    "highlighted": true,
    "top_ad": true,
    "options": ["bundle_premium"],
    "premium_ad_page": false,
    "urgent": false,
    "b2c_ad_page": false
  },
  "protect_phone": false,
  "shop": { "subdomain": null },
  "title": "<заголовок оголошення>",
  "status": "active",
  "url": "https://www.olx.ua/d/uk/obyavlenie/<slug>-ID<id>.html",
  "user": {
    "id": "<user id>",
    "uuid": "<uuid>",
    "about": "",
    "b2c_business_page": false,
    "banner_desktop": "",
    "banner_mobile": "",
    "company_name": "",
    "created": "<ISO дата реєстрації>",
    "is_online": false,
    "last_seen": "<ISO дата останньої активності>",
    "logo": null,
    "logo_ad_page": null,
    "name": "<назва/імʼя продавця>",
    "other_ads_enabled": true,
    "photo": null,
    "seller_type": null,
    "social_network_account_type": "facebook",
    "verification": { "status": "none" },
    "businessProfiles": null
  },
  "offer_type": "offer",
  "params": [
    {
      "key": "price",
      "name": "Ціна за 1 шт.",
      "type": "price",
      "value": {
        "__typename": "PriceParam",
        "value": 13100,
        "type": "arranged",
        "negotiable": true,
        "label": "13 100 грн.",
        "currency": "UAH",
        "converted_value": null,
        "converted_currency": null,
        "arranged": true,
        "budget": false
      }
    },
    {
      "key": "tablet_manufacturer",
      "name": "Марка планшету",
      "type": "select",
      "value": { "__typename": "GenericParam", "key": "5", "label": "Apple" }
    },
    {
      "key": "state",
      "name": "Стан",
      "type": "select",
      "value": { "__typename": "GenericParam", "key": "used", "label": "Вживане" }
    }
  ],
  "description": "<повний HTML-опис оголошення з <br /> тегами>",
  "external_url": null,
  "partner": null,
  "map": { "lat": 50.51015, "lon": 30.50243, "radius": 2, "show_detailed": false, "zoom": 12 },
  "safedeal": { "allowed_quantity": [], "weight_grams": 5000 },
  "valid_to_time": "2026-06-21T15:44:06+03:00",
  "isGpsrAvailable": false,
  "payAndShip": { "sellerPaidDeliveryEnabled": false }
}
```

`metadata` / `links` (рівень `clientCompatibleListings`, спільний для всієї відповіді):

```json
{
  "metadata": {
    "filter_suggestions": [
      {
        "category": 3731,
        "label": "Ціна за 1 шт.",
        "name": "filter_enum_price",
        "type": "price",
        "unit": null,
        "values": [
          { "label": "Безкоштовно", "value": "free" },
          { "label": "Обмін", "value": "exchange" }
        ],
        "constraints": { "type": "string" },
        "search_label": null,
        "clear_on_change": null,
        "break_line": null,
        "option": { "ranges": null, "order": null, "orderForSearch": null, "fakeCategory": null }
      }
    ],
    "x_request_id": "<рядок>",
    "search_id": "<рядок>",
    "total_elements": 1000,
    "visible_total_count": 3188,
    "source": { "promoted": [0, 1, 2], "organic": [3, 4, 5] },
    "search_suggestion": null,
    "facets": null,
    "new": null,
    "promoted": [0, 1, 2]
  },
  "links": {
    "first": { "href": "https://www.olx.ua/api/v1/offers?offset=0&limit=40&query=...&sl=..." },
    "next": { "href": "https://www.olx.ua/api/v1/offers?offset=40&limit=40&query=...&sl=..." },
    "previous": null,
    "self": { "href": "https://www.olx.ua/api/v1/offers?offset=0&limit=40&query=...&sl=..." }
  }
}
```
