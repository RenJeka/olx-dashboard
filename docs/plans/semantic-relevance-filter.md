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

## Евристичний пре-фільтр перед ШІ (додано, ідея з Antigravity CLI)

Щоб не слати в ШІ всю видачу (для «iphone 5» OLX віддає «iPhone 1**5**», «батарея **5**%»,
чохли — ~90% шуму), перед класифікацією працює дешевий детермінований пре-фільтр
`prefilterCandidates(target, listings)` у `server/src/analysis/relevance.ts`:

- Розбирає `relevance_target` на токени бренду (алфавітні, ≥2) і номера моделі (суто цифрові).
- Для цілей «бренд + номер моделі» лишає кандидатом лише оголошення, де бренд і номер моделі
  стоять у межах `RELEVANCE_PROXIMITY_WINDOW=4` слів (номер == модель або модель+літери:
  «5»/«5s»/«5c», але не «15»/«50»). Інші → одразу `relevant=false`, reason «Авто-відсіяно…».
- **Обережний:** ціль без номера моделі/бренду АБО якщо фільтр відкинув би все → повертає всіх
  кандидатами (вирішує ШІ). Краще зайвий false-positive у ШІ, ніж мовчки відкинути справжній лот.
- Відсіяні — звичайні `RelevanceItem`, показуються у списку результатів діалогу й виправні кліком.
- Застосовується в `runRelevance` (авто), `package.zip` (у ZIP лише кандидати) та `relevance/import`
  (інжектує відсіяних за scope `ids` — їх немає у ZIP/відповіді). Типи/схема БД не змінюються.
- `POST /relevance/preview` (`{target, ids}` → `{total, candidates, autoRejected}`) дає UI розбивку
  «скільки піде в ШІ vs авто-відсіється» — діалог показує її перед запуском/завантаженням ZIP.

## Ручний ZIP для агентного CLI (Antigravity, слабкі моделі)

Класифікація семантична (детермінованого движка немає), але мeхaніка заскриптована — ZIP містить:
- `prompt.txt` — жорстка покрокова процедура (нижче), а не «класифікуй усе одним махом»;
- `descriptions/chunk-NNN.json` — лише кандидати (після пре-фільтра), по `MANUAL_ZIP_CHUNK_SIZE`;
- готові `merge.py`/`verify.py` (`server/src/analysis/relevance_merge.py`/`relevance_verify.py`,
  копіюються в `dist` через `copyAssets.mjs`; шляхи — `promptData.ts`).

Процедура в `prompt.txt`: КРОК 1 — класифікувати КОЖЕН `chunk-NNN.json` окремо й записати
`classifications/result-NNN.json` (обробка по чанку обходить ліміт довжини відповіді); КРОК 2 —
`python merge.py` → `output.json`; КРОК 3 — `python verify.py` (повторити для чанків з відсутніми
id). Суворі заборони (жодних власних скриптів/«brain»-файлів, не редагувати merge/verify, не
«досліджувати» датасет) — щоб слабка модель не блукала. Користувач вставляє вміст `output.json`,
import домішує авто-відсіяних. Fallback для асистента без виконання коду — один об'єднаний JSON.

- НЕ перенесено з Antigravity: субагенти-на-батч; для НАШОГО сервера — і проміжні файли (стан у БД).
  Для зовнішнього агентного CLI проміжні файли (`result-NNN.json`/`output.json`) — навпаки доречні.

## Інваріанти

- Класифікація — ЛИШЕ вручну (з кнопки), ніколи зі сканів/cron.
- Пре-фільтр **обережний**: будь-який сумнів → кандидат до ШІ; жодне оголошення не зникає мовчки.
- PII продавця в промпт не йде (тільки id/title/params/description).
- Ручний override (`ai_relevant_source='manual'`) НЕ перетирається авто-прогоном (commit пропускає manual).
- `ai_relevant=0` ховається в таблиці за замовчуванням; перемикач «Показати нерелевантні» повертає з бейджем.
- **Консистентність:** видимість у таблиці й обсяг AI-аналізу (плюси/мінуси, AI Picks) — один
  предикат (`web/src/utils/listingVisibility.ts`). Майстер «Весь пошук»/«Таб» аналізує рівно
  стільки, скільки в дужках вкладки (нерелевантні/відфільтровані виключені). `loadPickCandidates`
  виключає `ai_relevant=0` (`ai_relevant IS NOT 0`).

## Test-cases

1. Авто (з `OPENROUTER_API_KEY`): для «iphone 5» чохли/запчастини → `relevant:false`, телефони → `true`.
2. Ручний (без ключа): ZIP → чат → вставка JSON → перегляд → commit.
3. Таблиця: нерелевантні приховані; перемикач повертає з бейджем + tooltip-причиною.
4. Клік по бейджу → рядок стає релевантним; повторний авто-прогон його НЕ перетирає (manual override).
5. Цільовий товар зберігається на пошуку й передзаповнюється при повторному відкритті.
6. `npm run build` — типчек server + web проходить.
7. Пре-фільтр (ціль «iphone 5»): «iPhone 5/5s» поруч → кандидат (до ШІ); «iPhone 15», Samsung,
   далекі згадки бренд↔«5» → авто-відсіяно (`relevant:false`, reason «Авто-відсіяно…»); до ШІ
   йде помітно менше за «Весь пошук (N)».
8. Пре-фільтр-регресія: ціль без номера моделі (напр. «ноутбук») → нічого не відсіюється евристикою.
9. Консистентність обсягу: на вкладці з нерелевантними (перемикач «Показати нерелевантні» OFF)
   майстер «AI» зі scope «Таб»/«Весь пошук» показує й аналізує рівно стільки, скільки в дужках
   вкладки; вмикання перемикача збільшує і вкладку, і обсяг аналізу синхронно. AI Picks-кандидати
   не містять `ai_relevant=0`.
