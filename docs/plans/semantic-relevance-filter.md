# План: Семантичний фільтр релевантності (AI «чи продає лот <запит>?»)

## Контекст

OLX GraphQL шукає не лише за `title`, а й за `description` (ймовірно через «АБО»): оголошення
про чохол/підставку/запчастину зі словом «iphone» в описі підпадає під запит «iphone 5» і
засмічує видачу. Локальні фільтри (стоп-слова/діапазони) тут безсилі — потрібна семантична
оцінка. Додаємо ручний AI-крок, що для кожного оголошення відповідає на одне питання:
**«Чи цей лот ПРОДАЄ товар `<цільовий товар>`?»** і ховає нерелевантні рядки (як локальні
фільтри, але семантично). Опис враховується навмисно: продавець може продавати асортимент.

Рішення (узгоджено з користувачем):
1. Окрема колонка `ai_relevant` + перемикач/бейдж у таблиці (не чіпати `status`/`filtered_out`).
2. Окрема кнопка «AI Фільтр» у хедері (не домішувати в наявний майстер плюсів/мінусів).
3. Лише вручну (інваріант «LLM-аналіз ніколи не авто» зберігається; зі сканів/cron не запускається).
4. Цільовий товар редагований, передзаповнюється `search.query`, зберігається на рівні пошуку.

Дзеркалимо наявну фічу **AI Вибір** (`server/src/analysis/aiPicks.ts`, `server/src/routes/aiPicks.ts`,
`web/src/components/analysis/AiPicksDialog.tsx`, колонки `ai_rank/*`) — самодостатня AI-фіча з
власними колонками, діалогом (idle→running→done), авто+ручним режимом і прямим commit у БД.

## Модель даних

- `listings`: `ai_relevant INTEGER` (NULL=не перевірено, 1=релевантне, 0=нерелевантне),
  `ai_relevant_reason TEXT`, `ai_relevant_at TEXT`, `ai_relevant_source TEXT` (api|import|manual).
  Додати в `schema.sql` (для свіжих БД) + `addColumnIfMissing` у `db.ts` ПІСЛЯ rebuild-блоку
  (поряд з `ai_rank`), НЕ в `LISTINGS_COMMON_COLUMNS`.
- `searches`: `relevance_target TEXT DEFAULT ''` (поряд з `analysis_criteria`).

## Файли

Backend:
- [x] `server/src/db/schema.sql` — нові колонки `listings` + `searches.relevance_target`.
- [x] `server/src/db/db.ts` — `addColumnIfMissing` для нових колонок.
- [x] `server/src/types.ts` — `RelevanceItem`, `RelevanceResponse`; поля `ai_relevant*` у `ListingRow`; `ai_relevant` у `ListingPatch`.
- [x] `server/src/analysis/relevance.ts` — `buildRelevancePrompt`, `parseRelevanceResponse`, `runRelevance`, `buildRelevanceZipInstructions`.
- [x] `server/src/analysis/repo.ts` — `getRelevanceTarget`/`setRelevanceTarget`.
- [x] `server/src/routes/relevance.ts` — target GET/PUT, analyze, package.zip, import, commit.
- [x] `server/src/index.ts` — реєстрація `relevanceRoutes`.
- [x] `server/src/routes/listings.ts` — `ai_relevant*` у `LISTING_COLUMNS`; PATCH приймає `ai_relevant`.

Frontend:
- [x] `web/src/types/index.ts` — `RelevanceItem`, `RelevanceResponse`; поля `ai_relevant*` у `Listing`; `ai_relevant` у `ListingPatch`.
- [x] `web/src/api/client.ts` — хуки `useRelevanceTarget`, `useSaveRelevanceTarget`, `useRunRelevance`, `useImportRelevance`, `useCommitRelevance`, `fetchRelevancePackageZip`.
- [x] `web/src/components/analysis/RelevanceFilterDialog.tsx` — новий діалог (idle→running→done).
- [x] `web/src/components/Header.tsx` — кнопка «AI Фільтр».
- [x] `web/src/stores/listingsUiStore.ts` — `showIrrelevant`.
- [x] `web/src/pages/ListingsTable.tsx` — фільтр видимості за `ai_relevant`.
- [x] `web/src/components/table/topbar/ListingsFilterBar.tsx` — Switch + лічильник.
- [x] `web/src/components/table/ListingsTableRow.tsx` — бейдж/іконка для `ai_relevant === 0`.

Docs:
- [x] `docs/architecture.md`, `docs/structure.md`, `CLAUDE.md` — новий модуль/роут/колонки/інваріант.

## Інваріанти

- Класифікація — ЛИШЕ вручну (з кнопки), ніколи зі сканів/cron.
- PII продавця в промпт не йде (тільки id/title/params/description).
- Ручний override (`ai_relevant_source='manual'`) НЕ перетирається авто-прогоном (commit пропускає manual).
- `ai_relevant=0` ховається в таблиці за замовчуванням; перемикач «Показати нерелевантні» повертає з бейджем.

## Test-cases

1. Авто (з `OPENROUTER_API_KEY`): для «iphone 5» чохли/запчастини → `relevant:false`, телефони → `true`.
2. Ручний (без ключа): ZIP → чат → вставка JSON → перегляд → commit.
3. Таблиця: нерелевантні приховані; перемикач повертає з бейджем + tooltip-причиною.
4. Клік по бейджу → рядок стає релевантним; повторний авто-прогон його НЕ перетирає (manual override).
5. Цільовий товар зберігається на пошуку й передзаповнюється при повторному відкритті.
6. `npm run build` — типчек server + web проходить.
