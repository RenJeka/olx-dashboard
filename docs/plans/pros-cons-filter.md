# Фільтрація за плюсами/мінусами (LLM-критерії)

## Контекст

Локальні фільтри пошуку вже підтримують діапазон цін, білий список міст і продавців.
Користувач хоче додати аналогічний білий список за **плюсами** та **мінусами** (критеріями
LLM-аналізу), щоб можна було показувати лише ті оголошення, у яких знайдено певний критерій.

**Семантика:** білий список (як міста). Якщо обрано хоча б один критерій групи → показуються
лише оголошення, де є хоча б один із обраних критеріїв у відповідному полі. Незаналізовані
(порожні `pros`/`cons`) — приховуються так само, як оголошення без міста при фільтрі міст.
Комбінування груп: AND (ціна AND міста AND продавці AND плюси AND мінуси).

**Джерело опцій у Drawer:** `searches.analysis_criteria` (JSON `{cons:[], pros:[]}`). Не
DISTINCT із рядків оголошень — канонічний набір критеріїв визначений на рівні пошуку.

**Зберігання у БД:** `listings.pros` / `listings.cons` — TEXT `• criterion\n• criterion`.
Готовий парсер: `parseBullets()` у `server/src/analysis/text.ts`.

## Файли що змінюються

| Файл | Зміна |
|---|---|
| `server/src/types.ts` | `LocalFilters` + `pros?/cons?`; `FilterOptions` + `pros/cons` |
| `server/src/scraper/localFilters.ts` | `FilterableListing` + `pros/cons`; нові правила в `evaluateFilteredOut` |
| `server/src/scraper/normalizer.ts` | `selectForFilterStmt` + тип `persisted` — додати `pros, cons` |
| `server/src/routes/searches.ts` | PATCH: `listingRows` + `pros, cons`; filter-options: повернути критерії з `analysis_criteria` |
| `web/src/types/index.ts` | Дзеркало `LocalFilters` і `FilterOptions` |
| `web/src/components/SearchFiltersDrawer.tsx` | Стан `pros/cons`, хелпери, секції UI, `handleSave` |
| `web/src/components/Searches.tsx` | `hasActiveLocalFilters` — додати перевірку `pros/cons` |

## Кроки

- [x] Створити цей файл плану
- [x] `server/src/types.ts` — розширити `LocalFilters`, `FilterOptions`
- [x] `server/src/scraper/localFilters.ts` — `FilterableListing` + нові правила
- [x] `server/src/scraper/normalizer.ts` — `pros, cons` у запиті та типі
- [x] `server/src/routes/searches.ts` — PATCH + filter-options
- [x] `web/src/types/index.ts` — дзеркало типів
- [x] `web/src/components/SearchFiltersDrawer.tsx` — UI секцій плюсів/мінусів
- [x] `web/src/components/Searches.tsx` — розширити `hasActiveLocalFilters`
- [x] `npm run build` — перевірка типів (чисто)

## Test-cases

1. **Build:** `npm run build` проходить без TS-помилок.
2. **filter-options API:** для пошуку із заданими `analysis_criteria` ендпойнт повертає
   непорожні `pros`/`cons`; для пошуку без критеріїв — `[]`.
3. **Drawer UI:** відкрити «Фільтри» пошуку → є секції «Плюси» та «Мінуси» з дропдаунами
   → обрати критерій → чип зʼявляється → Зберегти → тост «Перераховано: N приховано».
4. **Семантика — білий список:** після збереження фільтра в режимі «ВІДФІЛЬТРОВАНІ»
   лишаються лише оголошення з відповідним критерієм; незаналізовані — приховані.
5. **AND між групами:** ціна + мінус — приховуються ті, хто не проходить будь-яке правило.
6. **Індикатор у сайдбарі:** помаранчева крапка засвічується при активному фільтрі плюсів/мінусів.
7. **Скан:** upsert при скані коректно перераховує `filtered_out` для нових правил.
