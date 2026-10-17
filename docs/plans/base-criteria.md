# Базові плюси й мінуси за деревом категорій OLX

> **Статус:** 🟢 активний · дизайн і план реалізації схвалено людиною 2026-10-17; задачі 1–8 і 9.1–9.2 виконано (гілка `feat/base-criteria`); реліз чекає «так» людини, ручні test-cases 1–3 — після релізу · [P-016](../parking.md)

## Навіщо

Зараз кнопка «Згенерувати» дає до 50 мінусів чи плюсів на пошук (`MAX_CRITERIA` у `server/src/analysis/constants.ts`),
з них значна частина нерелевантна — людина довго їх розбирає. Для кожного типу товару важливих пунктів небагато:
для телефона «не працює», «розбитий екран»…, для ноутбука — свої, для побутової техніки — свої.

Мета: людина **один раз** заводить короткі базові набори мінусів і плюсів для категорій OLX; новий пошук
**автоматично** отримує набір своєї категорії, а людина лише зрідка додає дрібниці під конкретний товар.

**Успіх:** новий пошук одразу має релевантні базові мінуси й плюси без генерації; «Згенерувати» додає лише кілька
специфічних пунктів; розбирати 50 пунктів більше не доводиться.

## Що вирішила людина (2026-10-17)

| Питання | Рішення |
| --- | --- |
| Який набір отримує пошук | **Автоматично** — за категорією пошуку, без ручного вибору |
| Успадкування | **Об'єднання** вгору по дереву: пошук у «Мобільні телефони» отримує пункти «Електроніка» + «Телефони та аксесуари» + «Мобільні телефони». Базових пунктів може бути більше за 5–7 — це нормально |
| Набір пошуку | Базовий (успадкований) + власні додатки пошуку; базовий пункт у пошуку можна вимкнути — лише для цього пошуку |
| Розмір набору категорії | Орієнтир 5–7 найрелевантніших мінусів і стільки ж плюсів |
| Як наповнюються набори | Окремим разовим завданням — вручну, скриптом або разом з AI; далі — рідкі доповнення |
| Де зберігати набори | **У базі даних** (локально — файл libSQL, на проді — Turso), з редагуванням в інтерфейсі |
| Дерево категорій | Збирається окремим завданням (скрипт у циклі по пошукових словах) + доповнюється сканами |
| «Згенерувати» в пошуку | Лишається, але дає лише кілька специфічних пунктів і не повторює базові |
| Наявні пошуки | Теж отримують базові пункти; дублі зі старими згенерованими людина чистить один раз («Згрупувати автоматично» чи з агентом) |
| Базовий пункт у вікні пошуку | **Лише вимкнути** для цього пошуку; перейменувати / об'єднати / видалити — тільки у вікні «Базові плюси й мінуси», діє на всі пошуки |
| Перейменування чи об'єднання базового пункту | **Переписує** назву в оголошеннях усіх пошуків, що успадковують цю категорію (як зараз remap у межах пошуку) — щоб не ламався фільтр за мінусами/плюсами |

## Що з'ясувала розвідка (2026-10-17, живі запити до OLX)

- **GraphQL віддає дерево категорій.** У `searchParameters` запиту пошуку додається
  `{key: "facets", value: '[{"field":"category","fetchLabel":true,"fetchUrl":true,"limit":150}]'}`, у запит —
  `metadata { facets { category { id count label url } } }`. Відповідь — як у старого REST-запиту ([olx-api](../olx-api.md) §2.11):
  `id` (= `listings.category_id`), `label`, `count`, `url` зі слаг-шляхом повної ієрархії. Ліміт OLX — до 200 за запит
  (більше → `ListingError 400`).
- **Обходу зверху вниз немає.** Без пошукового слова — лише найпопулярніші категорії сайту (кореневі розділи й
  верхні рівні); фільтр `category_id` майже нічого не додає. Глибокі підкатегорії з'являються лише під конкретне слово →
  дерево збирається **по списку пошукових слів**.
- **Баг:** старий REST `/api/v1/offers/metadata/search/` (`fetchCategoryOptions`, `server/src/scraper/olxCategories.ts`) тепер
  отримує `403` і мовчки повертає `null` — `searches.category_facet` після сканів не оновлюється (локально: «macbook m1»,
  скан 2026-10-05 — дерева немає). Наслідок — порожній фільтр «Категорії» в нових пошуків. Упевненість середня; на проді
  не перевірено (одне читання Turso — за згодою людини).

## Дизайн

### 1. Дерево категорій — таблиця `olx_categories`

- Рядок на категорію: `id` (OLX id), `parent_id`, `label`, `slug`, `path` (людиномовний шлях), `updated_at`.
  `parent_id` виводиться зі слаг-шляху `url` (предок = попередній слаг; кожен предок приходить окремим елементом facet).
- Джерела, обидва через GraphQL `facets`:
  1. **Скан пошуку** — замість зламаного REST; той самий результат іде і в `searches.category_facet` (фільтр
     «Категорії» оживає), і upsert у `olx_categories`.
  2. **Збирач** (CLI `npm run categories:collect` і кнопка в UI, див. §5) — проганяє список пошукових слів (файл у репо, по кілька слів на кореневий
     розділ OLX), по одному запиту `limit=1` з паузою 1–2 с, зливає в таблицю, друкує, скільки нових категорій.
     Запуск — вручну людиною чи агентом; ввічливість — як у звичайного скану (`AGENTS.md` → «Інваріанти»).
- Лічильники OLX (`count`) у таблицю не пишуться — вони залежать від слова й швидко застарівають.

### 2. Базові набори — таблиця `base_criteria`

- Рядок на категорію: `category_id` → `olx_categories.id`, `criteria` — JSON у тому самому форматі, що
  `searches.analysis_criteria` (`{cons: [{name, aliases[], enabled}], pros: […]}`, парсинг — лише `server/src/analysis/criteria.ts`).
- Набір категорії = власні пункти; набір для пошуку = об'єднання наборів категорії та всіх предків
  (дублі за `phraseKey` зливаються, синоніми об'єднуються).

### 3. Категорія пошуку — автоматично

- Береться категорія, де **найбільше оголошень пошуку** (`listings.category_id`), з урахуванням фільтра «Категорії»
  пошуку (`local_filters.categories`), якщо його задано.
- Результат зберігається в **новій** колонці `searches.base_category_id` (наявне `searches.category_id` читається сканом як
  `SearchConfig.categoryId` — не змішувати з автокатегорією). Перераховується після скану й після зміни фільтра «Категорії»;
  людина бачить її у вікні «Плюси та мінуси» (напр. «Категорія: Мобільні телефони»).
- Зміна автокатегорії = інший базовий набір; записи «вимкнено» для пунктів, яких у новому наборі немає, просто ігноруються.
  До першого скану (оголошень немає) категорії немає — пошук має лише власні пункти.

### 4. Набір пошуку = базовий + власні

- `searches.analysis_criteria` лишається сховищем **власних** пунктів пошуку (наявні пошуки нічого не втрачають).
- Базові пункти пошук **не копіює**: їх зливає з власними сервер у момент читання (вікно «Плюси та мінуси», майстер
  аналізу, пошук мінусів/плюсів LLM чи Jev). Правка набору категорії одразу діє в усіх її пошуках.
- Вимкнути базовий пункт у пошуку — запис «вимкнено» у власному конфігу пошуку (назва + `enabled: false`); довідник не змінюється.
  Інших дій над базовим пунктом у вікні пошуку немає; автогрупування бачить базові пункти як «вже є» і не пропонує їх
  об'єднувати з власними — дубль власного пункту з базовим людина видаляє чи вимикає.
- У вікні «Плюси та мінуси» базові пункти позначено (бейдж «базовий», категорія-джерело).
- Наявні пошуки отримують базові пункти так само, як нові (рішення людини).

### 5. Редагування базових наборів

- Нове вікно «Базові плюси й мінуси»: дерево категорій з `olx_categories` → обрана категорія → списки «Мінуси» / «Плюси»
  з тими самими діями, що у вікні «Плюси та мінуси» (додати, перейменувати, синоніми, об'єднати, видалити, вимкнути).
- Кнопка «Згенерувати» для категорії — чернетка 5–7 пунктів від LLM на основі назви й шляху категорії (лише за кнопкою,
  платно), людина обирає, що додати. Те саме можна зробити й агентом як окреме завдання.
- Перейменування / об'єднання базового пункту переписує пункти в `listings.cons/pros` і посилання в `local_filters` усіх
  пошуків, чия автокатегорія — ця категорія чи її нащадок (логіка remap наявного `/criteria/remap`, лише по кількох пошуках;
  записуються лише рядки, де пункт справді є — Turso-економія). Видалення базового пункту оголошень не чіпає (як зараз).
- **Первинне місце довідників — прод.** Набори редагуються в інтерфейсі на проді; дерево там поповнюється сканами й кнопкою
  «Оновити дерево категорій» у цьому вікні (той самий збирач, що й `categories:collect`, працює на сервері). Локально —
  копія через `npm run db:copy-prod`; окремої синхронізації «локально → прод» немає.

### 6. «Згенерувати» в пошуку

- Ліміт — кілька специфічних пунктів (`MAX_CRITERIA` → 5–10); базові й власні пункти пошуку йдуть у промпт як «не повторюй».

## Поза скоупом

- Повне дерево всіх категорій OLX.
- Автоматичне наповнення наборів без участі людини.
- Перерахунок мінусів/плюсів уже проаналізованих оголошень після зміни наборів (лише як зараз — новим прогоном за кнопкою).
- Аудит усіх запитів до OLX — [P-017](../parking.md).

## Рішення агента (людина може переглянути)

- Окрема колонка `searches.base_category_id` замість наявного `searches.category_id`.
- Перерахунок автокатегорії — після скану й після зміни фільтра «Категорії»; без «фіксації» категорії.
- Первинне місце довідників — прод; дерево на проді поповнює кнопка «Оновити дерево категорій» (серверний збирач), без
  синхронізації локальної БД у прод.
- Перший крок реалізації — перевести дерево категорій скану на GraphQL `facets` (лагодить і фільтр «Категорії»).

## Відкрите для будівельника

- Точна схема таблиць, індекси (з огляду на Turso-економію), API-ендпойнти, розташування вікна в UI.
- Список пошукових слів для збирача дерева.

---

# План реалізації

> Для агента-виконавця: кроки — чекбокси; кожна задача закінчується зеленими тестами й `npm run check`. Коміт — лише за
> словом людини (`docs/rules.md` → «Git»), гілка `feat/base-criteria`. UI/E2E — лише за явним запитом людини.

**Мета:** базові мінуси/плюси за деревом категорій OLX, які пошук отримує автоматично (об'єднання вгору по дереву) + власні.

**Архітектура:** дерево категорій — таблиця `olx_categories` з GraphQL `facets` (скан + збирач); набори — таблиця
`base_criteria`; пошук зберігає лише власні пункти й вимкнені базові, сервер зливає базові з власними під час читання
(`getEffectiveCriteria`). Нове вікно «Базові плюси й мінуси» редагує набори на проді.

**Стек:** Fastify + `@libsql/client` (`dbAll`/`dbRun`/`dbBatchChunked`), Vitest на тимчасовій БД (`server/src/test/db.ts`),
React + Chakra UI v3 + TanStack Query. Нових залежностей немає.

## Глобальні обмеження

- Схема — лише `server/src/db/schema.sql`; нові колонки мігруються через `initDb()` (`ADD COLUMN` з дефолтом-константою).
- Turso-економія: без індексів на часто оновлювані колонки; upsert категорій пише рядок лише коли він змінився; батчі — `dbBatchChunked`.
- Ввічливість до OLX: збирач — пауза 1–2 с між запитами (`randomDelayMs`, `scraper/utils.ts`); facet-ліміт `150` (OLX приймає лише < 200).
- AI — лише за кнопкою; промпти — лише в `server/src/analysis/prompts.ts`; PII продавця в промпт не йде.
- Формат набору = формат `searches.analysis_criteria`; парсинг — лише `server/src/analysis/criteria.ts`.
- Коментарі й UI-текст — українською, ідентифікатори — англійською; без `any` у доменних типах.

## Що найімовірніше зламається (Review Focus)

1. Пошук без оголошень або з категорією, якої немає в `olx_categories` → лише власні пункти, без помилки (тест — задача 4).
2. Однакове формулювання в базовому й власному наборі → у пошуку один пункт (базовий перемагає, синоніми зливаються) (задача 4).
3. Клієнт надсилає PUT зі списком, де є базові пункти → в `analysis_criteria` вони не потрапляють, лише вимкнення в `base_disabled` (задача 4).
4. OLX повертає `ListingError` чи не-200 на `facets` → запис у журнал (`logWarn`), старе дерево лишається, скан не падає (задача 1).
5. Remap базового пункту: пошуки в предку категорії (не нащадку) не чіпаються (задача 5).

## Файли

Нові файли записано як `server: src/…` / `web: src/…` (шлях від теки пакета).

| Файл | Що |
| --- | --- |
| `server/src/db/schema.sql` | таблиці `olx_categories`, `base_criteria`; колонки `searches.base_category_id`, `searches.base_disabled` |
| server: `src/scraper/graphql/categories.ts` (новий) | `fetchCategoryFacet(query)` — GraphQL `facets` |
| `server/src/scraper/olxCategories.ts` | REST прибрати; лишити чисті перетворення facet → `CategoryOption[]` / `CategoryNode[]` |
| server: `src/categories/tree.ts` (новий) | `upsertCategories`, `ancestorIds`, `descendantIds`, `pickBaseCategory`, `refreshBaseCategory` |
| server: `src/categories/collector.ts`, `seedWords.ts` (нові) | збирач дерева по списку слів |
| server: `src/collectCategories.ts` (новий) + скрипт `categories:collect` | CLI збирача |
| server: `src/analysis/baseCriteria.ts` (новий) | `mergeBaseCriteria`, `stripBaseCriteria`, `getEffectiveCriteria` |
| server: `src/routes/categories.ts` (новий) | API дерева й базових наборів |
| `server/src/routes/analysis/criteria.ts`, `matching.ts` | ефективні критерії замість сирих; remap — спільний хелпер |
| `server/src/analysis/prompts.ts`, `constants.ts` | промпт чернетки для категорії; `MAX_CRITERIA` → `10` |
| `server/src/scanner/scanFinalize.ts`, `server/src/routes/searches.ts` | перерахунок автокатегорії |
| web: `src/api/categories.ts` (новий), `web/src/types/analysis.ts` | клієнт API, поле `CriterionGroup.base` |
| `web/src/components/analysis/criteria/*` | бейдж «базовий», лише перемикач для базових, рядок «Категорія: …» |
| web: `src/components/analysis/base/BaseCriteriaDialog.tsx`, web: `src/hooks/analysis/useBaseCriteriaManager.ts` (нові) | вікно «Базові плюси й мінуси» |
| `web/src/components/settings/sections/AnalysisSection.tsx` | кнопка «Базові плюси й мінуси» |
| Доки | `olx-api.md` (§2.11 + журнал §6), `architecture.md`, `structure.md`, `ai-flow.md`, `business-rules.md`, `AGENTS.md` (інваріант «Критерії — на рівні пошуку»), `current.md` |

### Задача 1. Дерево категорій через GraphQL (лагодить фільтр «Категорії»)

**Produces:**
- `interface FacetCategory { id: number; count: number; label: string; url: string }`, `interface CategoryNode { id: number; parentId: number | null; label: string; slug: string }` — `server/src/types/core.ts`
- `fetchCategoryFacet(query: string): Promise<FacetCategory[] | null>` — `scraper/graphql/categories.ts`
- `facetToOptions(cats: FacetCategory[]): CategoryOption[]`, `facetToNodes(cats: FacetCategory[]): CategoryNode[]` — `scraper/olxCategories.ts`
- `upsertCategories(nodes: CategoryNode[]): Promise<number>` (кількість нових/змінених) — `categories/tree.ts`

- [x] **1.1 Тести (падають):** server: `src/scraper/olxCategories.test.ts`
  - `facetToNodes`: url `/elektronika/q-x`, `/elektronika/noutbuki-i-aksesuary/q-x`, `/elektronika/noutbuki-i-aksesuary/noutbuki/q-x`
    (id `37`, `1502`, `80`) → `parentId` `null`, `37`, `1502`; `slug` `elektronika`, `noutbuki-i-aksesuary`, `noutbuki`.
  - Предка немає у відповіді → `parentId: null`.
  - `facetToOptions` дає те саме, що старий `buildOptions` (`path` — назви root→leaf, `olxCount` = `count`).
  - server: `src/categories/tree.test.ts`: `upsertCategories` двічі тими самими вузлами → другий виклик `0`; змінений `label` → `1`.
- [x] **1.2 Схема:** `olx_categories (id INTEGER PRIMARY KEY, parent_id INTEGER, label TEXT NOT NULL, slug TEXT NOT NULL, updated_at TEXT)`.
- [x] **1.3 Код:** `fetchCategoryFacet` — POST на `GRAPHQL_URL`, `searchParameters`: `query`, `offset=0`, `limit=1`,
  `facets=[{"field":"category","fetchLabel":true,"fetchUrl":true,"limit":150}]`; у запиті —
  `metadata { facets { category { id count label url } } }`. Не-200, `ListingError`, порожньо → `logWarn('scanner', 'category-facet', …)` і `null`.
  `upsertCategories` — `INSERT … ON CONFLICT(id) DO UPDATE … WHERE` хоч одне поле відрізняється.
- [x] **1.4** `refreshCategoryFacet` (`scanner/scanFinalize.ts`): `fetchCategoryFacet` → `searches.category_facet` (як було) + `upsertCategories`. REST-код і `SEARCH_METADATA_URL` прибрати.
- [x] **1.5** `npm run check` → зелений.
- [x] **1.6 Доки:** `olx-api.md` §2.11 (GraphQL `facets`, ліміт, REST → `403` з 2026-10-17) + журнал §6.

### Задача 2. Автокатегорія пошуку

**Consumes:** `olx_categories`, `CategoryNode` (задача 1). **Produces** (`categories/tree.ts`):
- `pickBaseCategory(counts: Array<{ categoryId: number; n: number }>, whitelist: number[]): number | null`
- `ancestorIds(rows: CategoryNode[], id: number): number[]` (від кореня до `id` включно); `descendantIds(rows: CategoryNode[], id: number): number[]` (`id` + нащадки)
- `refreshBaseCategory(searchId: number): Promise<number | null>` — пише `searches.base_category_id`

- [x] **2.1 Тести (падають):** `pickBaseCategory([{categoryId: 80, n: 5}, {categoryId: 1506, n: 9}], [])` → `1506`; той самий вхід з whitelist `[80]` → `80`;
  `[]` → `null`; нічия → менший `categoryId`. `ancestorIds(…, 80)` → `[37, 1502, 80]`; невідомий id → `[id]`.
  `descendantIds(…, 1502)` містить `1502` і `80`, не містить `37`.
  Роут (server: `src/routes/searches.test.ts`, новий): `PATCH /api/searches/:id` з `local_filters.categories: [80]` → `base_category_id = 80`.
- [x] **2.2 Схема:** `searches.base_category_id INTEGER`, `searches.base_disabled TEXT DEFAULT '{}'`.
- [x] **2.3 Код:** `refreshBaseCategory` — `SELECT category_id, COUNT(*) AS n FROM listings WHERE search_id = ? AND category_id IS NOT NULL GROUP BY category_id`
  + whitelist з `local_filters.categories`. Виклик — у фіналізації скану після `refreshCategoryFacet` і в `PATCH /api/searches/:id`, коли прийшов `local_filters`.
- [x] **2.4** `npm test` → PASS.

### Задача 3. Збирач дерева категорій

**Consumes:** `fetchCategoryFacet`, `facetToNodes`, `upsertCategories`. **Produces:**
- `collectCategories(words: string[], opts?: { delayMs?: () => number }): Promise<{ requested: number; changed: number; failed: string[] }>` — `categories/collector.ts`
- `SEED_WORDS: string[]` — `categories/seedWords.ts`: кілька слів на кожен кореневий розділ OLX (Електроніка, Дім і сад, Мода і стиль,
  Дитячий світ, Хобі, відпочинок і спорт, Авто, Запчастини, Тварини, Нерухомість, Бізнес та послуги, Робота)
- `POST /api/categories/collect` → `{ requested, changed, failed }`; другий запуск, поки іде перший → `409`
- CLI `npm run categories:collect` (`-- --words "a,b"` — свій список)

- [x] **3.1 Тест (падає):** `collector.test.ts`, `fetchCategoryFacet` замокано: 2 слова, друге → `null` → `failed: ['<друге>']`, `requested: 2`;
  пауза — між запитами, не після останнього.
- [x] **3.2 Код** + скрипти в `server/package.json` і кореневому `package.json`; роут — `routes/categories.ts`, реєстрація — `server/src/index.ts`.
- [x] **3.3** `npm test` → PASS; `npm run categories:collect -- --words "ноутбук"` локально → в `olx_categories` є «Електроніка → Ноутбуки та аксесуари → Ноутбуки».

### Задача 4. Базові набори й злиття з власними пунктами

**Consumes:** `ancestorIds`, `searches.base_category_id`, `searches.base_disabled`. **Produces:**
- `CriterionGroup.base?: { categoryId: number; label: string }` (сервер і `web/src/types/analysis.ts`) — лише у відповідях, у БД не пишеться
- `analysis/baseCriteria.ts`:
  - `mergeBaseCriteria(own: CriteriaConfig, bases: Array<{ categoryId: number; label: string; config: CriteriaConfig }>, disabled: Record<AnalysisMode, string[]>): CriteriaConfig`
  - `stripBaseCriteria(incoming: CriteriaConfig): { own: CriteriaConfig; disabled: Record<AnalysisMode, string[]> }`
  - `getEffectiveCriteria(searchId: number): Promise<{ config: CriteriaConfig; category: { id: number; path: string[] } | null }>`
- API: `GET /api/categories` → `Array<CategoryNode & { hasSet: boolean }>`; `GET /api/categories/:id/criteria` → `{ own: CriteriaConfig; inherited: CriteriaConfig }`;
  `PUT /api/categories/:id/criteria` (тіло як у `PUT /api/searches/:id/criteria`, оголошень не чіпає)
- `GET /api/searches/:id/criteria` → `CriteriaConfig & { category: { id: number; path: string[] } | null }`

- [x] **4.1 Тести (падають):** `analysis/baseCriteria.test.ts`
  - база «Електроніка»: cons `не працює`; «Ноутбуки»: cons `розбитий екран`; власні cons `подряпини` → ефективні cons: `не працює`, `розбитий екран` (з `base`), `подряпини` (без `base`).
  - власний `Розбитий Екран` + базовий `розбитий екран` → один пункт з `base`, синоніми обох злиті.
  - `disabled.cons = ['не працює']` → пункт є, `enabled: false`.
  - `stripBaseCriteria` (базовий `enabled: false` + власний) → `own` без базового, `disabled.cons = ['не працює']`.
  - роут: пошук без `base_category_id` → `GET …/criteria` — лише власні, `category: null`.
  - роут: `POST /api/searches/:id/criteria/remap` з базовим пунктом у `from` → `400` «Базовий пункт змінюється у вікні «Базові плюси й мінуси»».
- [x] **4.2 Схема:** `base_criteria (category_id INTEGER PRIMARY KEY, criteria TEXT DEFAULT '{}', updated_at TEXT)`.
- [x] **4.3 Код:** `getEffectiveCriteria` — `SELECT` пошуку + один `SELECT … FROM base_criteria WHERE category_id IN (<предки>)` + шлях з `olx_categories`.
  Ефективні критерії замість `parseCriteriaConfig(search.analysis_criteria)` у: `GET …/criteria`, `…/criteria/generate` і `…/criteria/prompt`
  (базові + власні — як «вже є»), `routes/analysis/matching.ts` (усі місця). `PUT …/criteria` — через `stripBaseCriteria`, пише `analysis_criteria` і `base_disabled`.
  `group-suggest` і remap пошуку — лише власні пункти.
- [x] **4.4** `npm test` → PASS.

### Задача 5. Перейменування / об'єднання базового пункту в усіх пошуках категорії

**Consumes:** `descendantIds`, `planRemap`, `remapBullets`. **Produces:**
- `remapListingStatements(searchId: number, mode: AnalysisMode, steps: Array<{ keys: Set<string>; to: string | null }>): Promise<{ statements: InStatement[]; filtersChanged: boolean }>`
  — винесено з `routes/analysis/criteria.ts` без зміни поведінки remap пошуку
- `POST /api/categories/:id/criteria/remap` (тіло як у remap пошуку) → `{ criteria: CriteriaConfig; updated: number; searches: number }`

- [x] **5.1 Тести (падають):** категорія `1502` з базовим `тріснутий екран`; пошук A (`base_category_id 80`, нащадок) і B (`base_category_id 37`, предок),
  в обох оголошення `• тріснутий екран` → remap `from ['тріснутий екран'] to 'розбитий екран'`: в A перейменовано, у B — ні; `searches: 1`.
  Наявні тести remap пошуку — зелені.
- [x] **5.2 Код:** оновити `base_criteria`; для кожного пошуку з `base_category_id IN descendantIds(id)` — `remapListingStatements`; один `dbBatchChunked`;
  `recomputeFilteredOut` — лише де у фільтрі є правило режиму. Видалення (`to: null`) оголошень не чіпає.
- [x] **5.3** `npm test` → PASS.

### Задача 6. Генерація: чернетка для категорії й коротший список у пошуку

**Produces:**
- `buildBaseCriteriaPrompt(path: string[], mode: AnalysisMode, existing: CriterionGroup[], opposite: CriterionGroup[]): string` — `analysis/prompts.ts`
- `BASE_CRITERIA_DRAFT = 7`; `MAX_CRITERIA` `50` → `10` (`analysis/constants.ts`)
- `POST /api/categories/:id/criteria/generate` `{ mode, model? }` → `{ criteria: string[] }` (лише пропозиція, не зберігає)

- [x] **6.1 Тести (падають):** промпт містить шлях «Електроніка → Ноутбуки та аксесуари → Ноутбуки», «не більше 7», успадковані пункти як «вже є», протилежний режим як «не включай»;
  `chat` замокано → 9 пунктів у відповіді обрізаються до 7 і проходять `excludeOppositeCriteria`. Промпт пошуку містить «не більше 10».
- [x] **6.2 Код:** `POLARITY_RULES` — спільні; описів оголошень у промпті категорії немає. `npm test` → PASS.

### Задача 7. UI вікна «Плюси та мінуси» пошуку

**Consumes:** `GET /api/searches/:id/criteria` з `category` і `base`.
- [x] **7.1** Під заголовком — «Категорія: Електроніка → Телефони та аксесуари → Мобільні телефони» або «Категорія ще не визначена — з'явиться після скану».
- [x] **7.2** Базовий пункт: бейдж «базовий» (тултіп — категорія-джерело), лише перемикач «в аналізі»; вибрати його для «Об'єднати в категорію…» / «Видалити» не можна.
  Крок 1 майстра аналізу показує базові пункти так само.
- [ ] **7.3** `npm run typecheck` → зелений ✅; ручна перевірка — test-cases 1–2 (чекає людину).

### Задача 8. Вікно «Базові плюси й мінуси»

**Consumes:** `GET /api/categories`, `GET/PUT /api/categories/:id/criteria`, `…/remap`, `…/generate`, `POST /api/categories/collect`.
- [x] **8.1** Кнопка «Базові плюси й мінуси» в «Налаштування» → «AI-аналіз» відкриває вікно.
- [x] **8.2** Ліворуч — дерево категорій з пошуком за назвою й позначкою «є набір»; кнопка «Оновити дерево категорій» (тост «Додано/оновлено N»; `409` → «Збір уже йде»).
- [x] **8.3** Праворуч — «Мінуси / Плюси», власні пункти категорії (додати, перейменувати, синоніми, об'єднати, видалити, вимкнути), нижче — успадковані (лише перегляд);
  «Згенерувати» → вікно «Згенеровано: нових N». `useBaseCriteriaManager(categoryId)` повторює інтерфейс `useCriteriaManager`, щоб перевикористати
  `CriteriaList`, `CriteriaInputBar` і діалоги об'єднання/видалення.
- [x] **8.4** `npm run typecheck`, `npm run build` → зелені.

### Задача 9. Документація, перевірка, реліз

- [x] **9.1** Доки з таблиці «Файли»; інваріант в `AGENTS.md`: «Критерії — базові на рівні категорії OLX (успадковуються вгору по дереву) + власні на рівні пошуку…».
- [x] **9.2** `npm run check`, `npm run build` → зелені; PR → CI зелений.
- [ ] **9.3** Реліз — лише після «так» людини (злиття = деплой); `npm run smoke`; людина проходить test-cases на проді.

## Test-cases (ручні, для людини)

**1. Категорія пошуку й базовий набір**

| # | Що зробити | Що маєш побачити |
| --- | --- | --- |
| 1 | «⋮» біля «mac mini» → «Плюси та мінуси» | Угорі рядок «Категорія: …» — запам'ятай останню назву |
| 2 | Закрий вікно → шестірня «Налаштування» → «AI-аналіз» → «Базові плюси й мінуси» | Вікно «Базові плюси й мінуси» з деревом категорій |
| 3 | «Оновити дерево категорій» | Через хвилину-дві — повідомлення «Додано/оновлено N»; у дереві є «Електроніка» |
| 4 | У дереві знайди категорію з кроку 1 → «Мінуси» → впиши `не вмикається` → «+» | Пункт у списку |
| 5 | Закрий вікно → «⋮» біля «mac mini» → «Плюси та мінуси» → «Мінуси» | `не вмикається` з бейджем «базовий» |
| 6 | Вимкни перемикач у рядку `не вмикається` | Пункт вимкнено лише в цьому пошуку; у «Базові плюси й мінуси» він увімкнений |

**2. Перейменування базового пункту**

| # | Що зробити | Що маєш побачити |
| --- | --- | --- |
| 1 | «Базові плюси й мінуси» → категорія з test-case 1 → галочка біля `не вмикається` → «Об'єднати в категорію…» → `не вмикається або мертвий` → підтвердити | Пункт перейменовано |
| 2 | «Плюси та мінуси — mac mini» | `не вмикається або мертвий` з бейджем «базовий»; в оголошеннях зі старою назвою — нова |

**3. Генерація**

| # | Що зробити | Що маєш побачити |
| --- | --- | --- |
| 1 | «Базові плюси й мінуси» → «Ноутбуки» → «Мінуси» → «Згенерувати» (платно, частки цента) | Вікно «Згенеровано: нових N», не більше 7, лише недоліки |
| 2 | «Не додавати» → «Плюси та мінуси» будь-якого пошуку → «Згенерувати» | Не більше 10, без повторів базових пунктів |
