# План: Синоніми пошукового запиту («варіанти пошуку»)

## Контекст

OLX-оголошення того самого товару називають по-різному («біговел», «велобіг», «ранбайк»…).
Зараз кожен синонім вимагає окремого «Пошуку» — дублює весь flow (скан, статуси, фільтри,
AI-аналіз) і розпорошує оголошення між кількома `search_id`. Мета: один «Пошук» має список
**синонімів запиту**, які автоматично скануються разом і зливаються в одну видачу по `olx_id`.
Синоніми генеруються промптом (копія / авто через OpenRouter-ключ), редагуються/видаляються.

**Зв'язність слабка** (за дослідженням): `query` ізольований у скануванні; AI плюси/мінуси
(`buildCriteriaPrompt` бере `search.name`), `listingVisibility.ts`, локальні фільтри — НЕ
залежать від `query`. OLX GraphQL не має нативного OR/мульти-query (`docs/olx-api.md` §2.5),
тож підхід — **N запитів + злиття по `olx_id`** (патерн злиття вже є у фетчері).

**Рішення (узгоджено з користувачем):**
1. Синоніми живлять і **AI-фільтр релевантності** (як alias-назви товару).
2. Скан по синонімах — **автоматично у звичайному скані** (і deep), з мерджем.
3. Керування — **окреме модальне вікно** «Варіанти пошуку», відкривається зі створення пошуку
   (і з редагування існуючого). Скан окремого варіанта — поза скоупом (на майбутнє).

## Технічні інваріанти

- **Дедуплікація безпечна** в межах одного `search_id` (`listings.olx_id UNIQUE`, upsert —
  `normalizer.ts:64-123`). `search_id` пишеться лише на INSERT — для синонімів одного пошуку це
  не проблема.
- **Вікно покриття (auto-disable) НЕ застосовувати** до мульти-query (як split-скан: union
  кількох видач не відсортований глобально за `last_refresh`; `scanner.ts:189-195`). При >1
  query примусово `partial=true` → `applyScanStatuses` пропускається; живість — за verify.
- Мульти-query реалізується **зовні** (цикл у `scanner.ts` з клонуванням `query`), сам
  `graphqlOlxFetcher.ts` НЕ змінюється.

## Файли

**Створити:** `server/src/routes/searchSynonyms.ts`, `web/src/components/SearchVariantsDialog.tsx`.
**Змінити:** `server/src/db/db.ts`, `server/src/db/schema.sql`, `server/src/types.ts`,
`server/src/scanner.ts`, `server/src/analysis/prompts.ts`, `server/src/analysis/parse.ts`,
`server/src/analysis/repo.ts`, `server/src/analysis/relevance.ts`, `server/src/routes/relevance.ts`,
`server/src/routes/searches.ts` (+ роут-індекс), `web/src/types/index.ts`, `web/src/api/client.ts`,
`web/src/components/Searches.tsx`.
**Документація:** `CLAUDE.md`, `docs/architecture.md`, `docs/structure.md`, `docs/olx-api.md`.

## Кроки

### A. Дані / схема
- [x] `server/src/db/db.ts`: міграція `addColumnIfMissing('searches', 'query_synonyms', "TEXT DEFAULT '[]'")` (поряд із `relevance_target`).
- [x] `server/src/db/schema.sql`: додати `query_synonyms TEXT DEFAULT '[]'` у `searches`.
- [x] `server/src/types.ts`: `SearchConfig.querySynonyms?: string[]`.
- [x] `web/src/types/index.ts`: `Search.query_synonyms?: string[]`, `NewSearchInput.query_synonyms?: string[]`.

### B. Backend — мульти-query скан
- [x] `scanner.ts loadSearch`: додати `query_synonyms` у SELECT, розпарсити JSON → `querySynonyms` (try/catch → `[]`).
- [x] `scanner.ts`: хелпер `fetchAllQueries(search, options)` — список `dedup([query, ...querySynonyms].trim().filter)`; 1 запит → `fetchWithFallback` як зараз; >1 → цикл по варіантах (клон `SearchConfig` з `query=variant`), злиття `RawListing[]` у `Map<olxId>`, пауза між варіантами, агрегація `requestsUsed`/прогресу (база-офсет), `partial=true` + `note` «multi-query: N варіантів змерджено; вікно покриття пропущено».
- [x] `scanner.ts runScan`: викликати `fetchAllQueries` замість `fetchWithFallback` (гілка `applyScanStatuses` уже керується `!partial` — пропуск автоматичний).
- [x] Ввічливість: лишити наявні капи у `fetchSearchSplit`, додати паузу між варіантами; задокументувати множник запитів.

### C. Backend — генерація синонімів (stateless)
- [x] `server/src/analysis/prompts.ts`: `buildSynonymsPrompt(query)` — «згенеруй альтернативні пошукові запити-синоніми для OLX (укр/рос варіанти, сленг, друкарські форми), СТРОГО JSON-масив рядків».
- [x] `server/src/analysis/parse.ts`: `parseSynonymsResponse(raw): string[]` (зняти ```json, JSON.parse масиву/`{synonyms:[]}`, trim/dedup/непорожні — за зразком `parseCriteriaResponse`).
- [x] `server/src/routes/searchSynonyms.ts` (+ реєстрація у роут-індексі): `POST /api/search-synonyms/prompt` body `{query}`→`{prompt}`; `POST /api/search-synonyms/generate` body `{query,model?}`→`{synonyms}` (`!hasApiKey()`→409); `POST /api/search-synonyms/import` body `{raw}`→`{synonyms}`. Використати `chat()`, `hasApiKey()`, `DEFAULT_MODEL`.

### D. Backend — AI-фільтр релевантності з синонімами
- [x] `server/src/analysis/repo.ts`: `getRelevanceAliases(searchId): string[]` (парс `query_synonyms`).
- [x] `server/src/analysis/relevance.ts`: `relevanceRules(target, aliases?)` (рядок «Синоніми назви товару: …»); прокинути aliases у `buildRelevancePrompt`/`buildRelevanceZipInstructions`/`prefilterCandidates`/`runRelevance`. У `prefilterCandidates` — `parseTarget` по target + кожному alias, union `words`/`models` (лише розширює коло кандидатів — безпечно).
- [x] `server/src/routes/relevance.ts`: у `preview`/`analyze`/`package.zip`/`import` підвантажити `getRelevanceAliases(id)` і передати в prefilter/prompt-білдери.

### E. Backend — persist синонімів
- [x] `server/src/routes/searches.ts`: `SearchBody.query_synonyms?: string[]`; POST create і PATCH пишуть `query_synonyms` через `toJsonText`.

### F. Frontend
- [x] `web/src/api/client.ts`: `useCreateSearch` і PATCH-хук передають `query_synonyms`; нові хуки `useGenerateSynonyms`/`useSynonymsPrompt`/`useImportSynonyms` (за зразком criteria-хуків).
- [x] `web/src/components/SearchVariantsDialog.tsx` (модал, як `RelevanceFilterDialog`): read-only `query` + редагований список синонімів (додати/редагувати/видалити); секція генерації (дзеркало `CriteriaStep` + `ManualAssistant`: «Згенерувати» авто за наявності ключа, «Згенерувати вручну» копія+парс). Два режими: `value`/`onChange` (форма створення) або `searchId`+PATCH (існуючий пошук) — реалізовано як повністю контрольований компонент (`open`/`onOpenChange`), як `SearchFiltersDrawer`.
- [x] `web/src/components/Searches.tsx`: форма створення — стейт `synonyms`, кнопка «Варіанти пошуку…» біля поля «Запит», `submit` передає `query_synonyms`; `SearchRow` — відкриття діалогу через пункт 3-dot меню (+ лічильник синонімів).

### G. Документація
- [x] `CLAUDE.md` (секція збору/інваріантів), `docs/architecture.md`, `docs/structure.md`.

## Що НЕ чіпати

- AI плюси/мінуси (`prompts.ts buildCriteriaPrompt` → `search.name`), `analysis/criteria.ts`, `analyze.py`.
- `web/src/utils/listingVisibility.ts`, `server/src/scraper/localFilters.ts` (не залежать від query/target).
- Внутрішня логіка `graphqlOlxFetcher.ts`.

## Test-cases (UI прогонить користувач)

- [ ] Міграція: старт на наявній БД додає `query_synonyms` (default `[]`); наявні пошуки працюють як раніше.
- [ ] Створення пошуку: «Варіанти пошуку…» → ввести/згенерувати синоніми → зберегти → у БД масив.
- [ ] Генерація: без ключа «Згенерувати» прихована, «Згенерувати вручну» дає промпт, вставка JSON-масиву → чипи; з ключем авто-генерація повертає список.
- [ ] Звичайний скан з 2+ синонімами: видача об'єднана, дублікати по `olx_id` злиті; `scan_runs.error` має позначку multi-query; **жодного auto-disable**. Пошук з 1 query — поведінка не змінилась, auto-disable працює.
- [ ] Deep-скан з синонімами: завершується, бюджет/паузи дотримані, дублікати злиті.
- [ ] AI-фільтр релевантності: промпт містить синоніми як alias; пре-фільтр для «біговел» (без бренду/моделі) пропускає всіх; ручний override не перетирається.
- [ ] Редагування синонімів існуючого пошуку через діалог (PATCH) зберігається.
- [x] `npm run build` (server+web) проходить; TS strict без `any` у доменних типах.
