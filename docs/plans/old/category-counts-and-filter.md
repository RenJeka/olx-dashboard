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

**Рішення (джерело назв верифіковано live 2026-06-23):**
- **Назви + ієрархія + OLX-лічильники** — з facet метаданих пошуку (ОДИН запит, `olx-api.md` §2.11):
  `…/offers/metadata/search/?query=<q>&facets=[{field:category,fetchLabel:true,fetchUrl:true}]`
  → `{id, count, label, url}`; ієрархія з `url`-слагів. Тягнеться `scanner.ts` після успішного
  скану (best-effort), кешується у `searches.category_facet` (JSON `CategoryOption[]`). Фільтр читає
  кеш — **без мережі в запиті**.
- **Локальні лічильники** («наших у базі») — з per-listing `listings.category_id` (+`category_type`),
  рахуються **в пам'яті** з уже завантаженого масиву listings (0 додаткових запитів до БД).
- **Фільтрація** — нова група `categories` у `local_filters` (білий/чорний список + invert), збіг по
  `listings.category_id`.
- **UI:** дерево у Drawer локальних фільтрів; біля кожного вузла **два числа — «наших / на OLX»**.

> Перевірені факти OLX-API (live 2026-06-23): `…/api/v1/categories/` — deprecated/access denied;
> `…/metadata/search-categories/` — лише `{id,count}` без назв; робочий — facet `…/metadata/search/`
> (вище). Деталі — пам'ять `olx-category-facet-endpoint`, `docs/olx-api.md` §2.11.

## Файли

### Backend
- `server/src/db/schema.sql` + `db.ts` — `listings`: `category_id`/`category_type`;
  `searches`: `category_facet TEXT` (кеш дерева). `addColumnIfMissing` для бекфілу наявної БД.
- `server/src/scraper/graphql/{constants,types,fetcher}.ts` — query запитує `category { id type }`,
  `GraphqlListing.category`, `mapListing` витягує `categoryId`/`categoryType`.
- `server/src/types.ts` — `RawListing.categoryId/categoryType`; `LocalFilters.categories`+invert;
  `CategoryOption {id, path, olxCount}`; `FilterOptions.categories`.
- `server/src/scraper/normalizer.ts` — UPSERT пише `category_id`/`category_type`; `FilterableListing`
  читає `category_id`.
- `server/src/scraper/localFilters.ts` — гілка `categories` в `evaluateFilteredOut`.
- `server/src/scraper/olxCategories.ts` (**новий**) — `fetchCategoryOptions(query)`: facet OLX →
  `CategoryOption[]` (id + шлях назв + olxCount; ієрархія з url-слагів). Best-effort.
- `server/src/scanner.ts` — `refreshCategoryFacet(searchId, query)` після успішного скану → кеш у
  `searches.category_facet`.
- `server/src/routes/searches.ts` — рекомпʼют PATCH читає `category_id`; `/filter-options` віддає
  `categories` з кешу `searches.category_facet` (без мережі).
- `server/src/routes/listings.ts` — SELECT повертає `category_id`/`category_type`.

### Frontend
- `web/src/types/index.ts` — `Listing.category_id/category_type`; `LocalFilters.categories`+invert;
  `CategoryOption {id, path, olxCount}`; `FilterOptions.categories`.
- `web/src/utils/categoryCounts.ts` (**новий**) — `buildCategoryCountMap` + `buildCategoryTree`
  (вузол: `localCount` сумою по підгілці + `olxCount` із facet) + `nodeCheckedState`.
- `web/src/hooks/useCategoryTree.ts` (**новий**) — обв'язка listings+дерево (лічильники в пам'яті).
- `web/src/components/searches/local-filters/CategoryFilter.tsx` (**новий**) — дерево, чекбокси,
  invert, два числа «наших / OLX».
- `web/src/components/searches/SearchFiltersDrawer.tsx` — вмонтувати `CategoryFilter`.
- `web/src/hooks/useLocalFiltersForm.ts` — стан `categories: number[]` + `categoriesInvert`.
- `web/src/utils/localFilters.ts` — серіалізація/парсинг групи `categories`; `hasActiveLocalFilters`.
- `web/src/constants.ts` — `LOCAL_FILTER_DESCRIPTIONS.categories`.

### Документація
- `docs/architecture.md`, `docs/structure.md`, `docs/olx-api.md` §2.11 (верифікований facet),
  `server/src/db/schema.sql` коментарі.

## Кроки

- [x] Backend: схема/міграція (listings.category_*, searches.category_facet) + GraphQL category.
- [x] Backend: normalizer UPSERT + LocalFilters.categories + evaluateFilteredOut.
- [x] Backend: olxCategories.fetchCategoryOptions (facet) + scanner.refreshCategoryFacet +
  /filter-options з кешу + listings SELECT.
- [x] Frontend: типи + форма + payload + categoryCounts + useCategoryTree + CategoryFilter (наших/OLX) + Drawer.
- [x] Документація + build.

## Test-cases

1. ✅ `npm run build` — типи беку/фронту збираються (strict).
2. ✅ `fetchCategoryOptions('велобіг')` live → 36 `CategoryOption` з назвами/ієрархією/OLX-лічильниками.
3. ▢ Скан пошуку → `listings.category_id` заповнені; `searches.category_facet` оновлено.
4. ▢ Drawer → «Категорії»: дерево з двома числами біля вузла («наших / OLX»); сума підкатегорій
   (наших) сходиться; OLX-число — facet категорії.
5. ▢ Вибір категорії/підкатегорії + Зберегти → ретроактивний перерахунок `filtered_out`; таблиця
   показує лише відповідні (invert — навпаки); «Результатів» оновлюється. Перезавантаження → вибір збережено.

## Відповідь на питання «скільки операцій зчитування»

2000 записів, 10 категорій × 5 підкатегорій = 60 вузлів.
- Наївно (COUNT на вузол): 60 × 2000 = **~120 000 зчитувань**. Не робити так.
- Правильно (один `GROUP BY category, subcategory`): **один прохід = 2000 зчитувань**, БД дає всі 60
  чисел; підсумок категорії = сума підкатегорій (без додаткових зчитувань).
- У цьому застосунку: listings уже в пам'яті фронту → **0 додаткових зчитувань із БД**, один
  O(n)=2000 прохід у JS. Обрано саме цей варіант.
