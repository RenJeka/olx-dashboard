# План: Категорії/підкатегорії з лічильниками + фільтрація

## Контекст

На OLX у видачі поруч із кожною категорією/підкатегорією показано кількість оголошень і можна
фільтрувати по них. Хочемо те саме в дашборді: дерево «категорія → підкатегорія» з числом
оголошень біля кожного вузла + фільтрацію по вибраних вузлах, інтегровану в наявні **локальні
фільтри** (`searches.local_filters`).

**Перешкода:** категорія оголошення зараз **ніде не зберігається** — у `listings` немає колонки,
а GraphQL-query не запитує поле `category`, хоча OLX його повертає, але **лише**
`{ id: 3731, type: "electronics" }` (числовий id листа + грубий слаг). Ні назви, ні дерева
підкатегорій у per-listing відповіді немає. Тому потрібні: (1) збір категорії під час скану,
(2) словник категорій OLX для назв/ієрархії, (3) ре-скан для бекфілу наявних рядків.

**Рішення:** per-listing зберігаємо `category_id`+`category_type`; назви/ієрархію беремо зі
словника категорій OLX (кеш `server/data/olx-categories.json`, з fallback на id/слаг, якщо
недоступний); дерево з лічильниками — у наявному Drawer локальних фільтрів; лічильники рахуються
**в пам'яті** з уже завантаженого масиву listings (0 додаткових запитів до БД); фільтрація — нова
група `categories` у `local_filters` (білий/чорний список + invert).

> ⚠️ Ендпойнт словника категорій OLX (кандидат `https://www.olx.ua/api/v1/categories/`) **НЕ
> верифіковано live** (мережа OLX у build-середовищі заблокована egress-політикою). Реалізація
> самоперевіряється у рантаймі + graceful fallback на id/слаг; формат відповіді звірити при
> першому живому запуску локально.

## Файли

### Backend
- `server/src/db/schema.sql` — `listings`: `category_id INTEGER`, `category_type TEXT`.
- `server/src/db/db.ts` — `addColumnIfMissing` для двох нових колонок (бекфіл наявної БД).
- `server/src/scraper/graphql/constants.ts` — у `LISTING_SEARCH_QUERY` додати `category { id type }`.
- `server/src/scraper/graphql/types.ts` — `GraphqlListing.category`.
- `server/src/scraper/graphql/fetcher.ts` — `mapListing` витягує `categoryId`/`categoryType`.
- `server/src/types.ts` — `RawListing.categoryId/categoryType`; `LocalFilters.categories` +
  `invert.categories`; `FilterOptions.categories: CategoryOption[]`; новий тип `CategoryOption`.
- `server/src/scraper/normalizer.ts` — UPSERT пише `category_id`/`category_type`; `FilterableListing`
  читає `category_id`.
- `server/src/scraper/localFilters.ts` — гілка `categories` в `evaluateFilteredOut`.
- `server/src/routes/searches.ts` — рекомпʼют PATCH читає `category_id`; `/filter-options` віддає
  `categories` (distinct id + шлях назв зі словника).
- `server/src/routes/listings.ts` — SELECT повертає `category_id`/`category_type`.
- `server/src/scraper/olxCategories.ts` (**новий**) — fetch+кеш словника OLX, `resolveCategoryPath`.

### Frontend
- `web/src/types/index.ts` — `Listing.category_id/category_type`; `LocalFilters.categories`+invert;
  `FilterOptions.categories`; `CategoryOption`.
- `web/src/components/searches/local-filters/CategoryFilter.tsx` (**новий**) — дерево з
  лічильниками+чекбоксами+invert.
- `web/src/components/searches/SearchFiltersDrawer.tsx` — вмонтувати `CategoryFilter`.
- `web/src/hooks/useLocalFiltersForm.ts` — стан `categories: number[]` + `categoriesInvert`.
- `web/src/utils/localFilters.ts` — серіалізація/парсинг групи `categories`; `hasActiveLocalFilters`.
- `web/src/utils/categoryCounts.ts` (**новий**) — побудова `Map<category_id,count>` + агрегація дерева.
- `web/src/constants.ts` — `LOCAL_FILTER_DESCRIPTIONS.categories`.

### Документація
- `docs/architecture.md`, `docs/structure.md`, `docs/olx-api.md` (query тепер запитує `category`;
  словниковий кеш-файл), `server/src/db/schema.sql` коментарі.

## Кроки

- [ ] Backend: схема + міграція колонок.
- [ ] Backend: GraphQL query/тип/мапінг category.
- [ ] Backend: normalizer UPSERT + filterable.
- [ ] Backend: LocalFilters.categories + evaluateFilteredOut.
- [ ] Backend: словник OLX (olxCategories.ts) + /filter-options.categories + listings SELECT.
- [ ] Frontend: типи + форма + payload + CategoryFilter + counts + Drawer.
- [ ] Документація + build.

## Test-cases

1. `npm run build` — типи беку/фронту збираються (strict).
2. Скан пошуку → `listings.category_id/category_type` заповнені; `server/data/olx-categories.json`
   зʼявляється (або, якщо мережа недоступна — fallback: дерево показує id/слаг, без падіння).
3. Drawer → секція «Категорії»: дерево з числом біля кожного вузла; сума підкатегорій = число категорії.
4. Вибір категорії/підкатегорії + Зберегти → ретроактивний перерахунок `filtered_out`; таблиця
   показує лише відповідні (invert — навпаки); «Результатів» оновлюється.
5. Перезавантаження → вибір збережено в `local_filters`.

## Відповідь на питання «скільки операцій зчитування»

2000 записів, 10 категорій × 5 підкатегорій = 60 вузлів.
- Наївно (COUNT на вузол): 60 × 2000 = **~120 000 зчитувань**. Не робити так.
- Правильно (один `GROUP BY category, subcategory`): **один прохід = 2000 зчитувань**, БД дає всі 60
  чисел; підсумок категорії = сума підкатегорій (без додаткових зчитувань).
- У цьому застосунку: listings уже в пам'яті фронту → **0 додаткових зчитувань із БД**, один
  O(n)=2000 прохід у JS. Обрано саме цей варіант.
