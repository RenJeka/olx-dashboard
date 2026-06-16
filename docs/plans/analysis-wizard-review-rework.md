# План: AI-майстер — переробка кроку 3 (Перевірка) + ZIP-пакет ручного режиму (крок 2)

> Прогрес: познач `[x]` коли пункт виконано. Легенда: `[ ]` — заплановано, `[~]` — у роботі, `[x]` — готово.
>
> **Для виконавця:** базовий план LLM-аналізу — [`llm-analysis.md`](./llm-analysis.md)
> (повністю виконано, не редагується). Інваріанти — [`../../CLAUDE.md`](../../CLAUDE.md).

## Context

Майстер AI-аналізу (мінуси/плюси, `AnalysisWizardDialog.tsx`) пройшов перший етап
реалізації (`llm-analysis.md`, повністю виконано), але після практичного використання
кроку 3 («Перевірка») і ручного режиму кроку 2 («Пошук») виявлено UX-проблеми:

1. Крок 3 показував **усі** оголошення, включно з тими, де LLM нічого не знайшов
   («нічого не знайдено») — заважало огляду результатів.
2. Layout кроку 3 був вертикальними картками (фото+назва+опис+бейджі стовпчиком), а не
   таблицею. Потрібно: ліворуч фото+назва, центр — опис, праворуч — теги критеріїв.
3. Опис був обрізаний 3 рядками (`lineClamp={3}`) без можливості прочитати повністю — на
   відміну від основної таблиці оголошень, де є tooltip-при-наведенні + модалка-при-кліку.
4. Ручний режим кроку 2 генерував текстові файли «Частина N/M» для копіювання по одному й
   вставки відповіді по одній — неефективно для великих пошуків. Замінено на **ZIP-архів**
   (`prompt.txt` + `descriptions/chunk-NNN.json`, по 50 оголошень у файлі) для одноразового
   завантаження в безкоштовний чат (Claude Projects/Code), що за один прохід обробить усі
   чанки й поверне **єдиний** JSON-результат для вставки назад.
5. На кроці 3 користувач отримав можливість **вручну включати/виключати** запропоновані LLM
   критерії для кожного оголошення (toggle на тегах) — включно з тими, де `evidence` не
   підтверджено (`ok=false`), якщо користувач вважає критерій доречним.
6. `evidence`-цитати візуально виділені у новій таблиці: в описі (через `HighlightText`, з
   урахуванням toggle-стану) і на самих тегах (tooltip із цитатою при наведенні). `evidence`
   лишається транзитним — **НЕ зберігається в БД** (інваріант не змінено).

## Критичні файли та паттерни (перевикористано)

- `web/src/components/table/DescriptionTooltip.tsx` + `web/src/components/DescriptionDialog.tsx`
  — hover-tooltip (з `HighlightText`) + click-модалка повного опису, як в основній таблиці.
- `web/src/components/table/HighlightText.tsx` — підсвітка масиву evidence-фрагментів.
- `web/src/utils/download.ts` (`downloadBlob`) — перевикористано для завантаження ZIP.
- `web/src/components/analysis/ManualAssistant.tsx` — бічна панель ручного режиму
  (copy/download parts + textarea вставки); розширена опціональним `emptyHint`, не
  переписана.
- `server/src/analysis/prompts.ts` (`buildMatchingPrompt`, `pickSample`) — єдине джерело
  промптів; auto-режим (`/analyze`) лишився повністю працюючим після рефакторингу.
- `server/src/export/xlsx.ts` — приклад генерації файлу-відповіді у Fastify-роуті (для ZIP —
  `archiver` замість `exceljs`).

## Група 1 — Backend: ZIP-пакет замість `/analyze/package`

- [x] `server/package.json`: додано `archiver` + `@types/archiver` (dependencies/devDependencies).
- [x] `server/src/analysis/constants.ts`:
  - Додано `MANUAL_ZIP_CHUNK_SIZE = 50` (оголошень на файл чанку), `MIME_ZIP = 'application/zip'`.
  - Видалено `MANUAL_PACKAGE_TOKEN_CAP`, `CHARS_PER_TOKEN`.
- [x] `server/src/analysis/text.ts`: видалено `estimateTokens` (використовувався лише для
  token-cap branching у старому `/analyze/package`).
- [x] `server/src/analysis/prompts.ts`:
  - `buildMatchingPrompt(criteria, listings, mode)` — лишився без функціональних змін
    (використовується auto-режимом `/analyze`); внутрішньо розбитий на приватні helpers
    (`matchingRoleAndCriteria`, `matchingRulesAndFormat`, `buildListingBlock`) для
    перевикористання без дублювання тексту.
  - Новий `buildManualZipInstructions(criteria, mode): string` — текст `prompt.txt`:
    роль/завдання + список дозволених критеріїв + опис формату вхідних файлів
    (`descriptions/chunk-NNN.json` → масив `{id, title, characteristics, description}`) +
    правила анти-галюцинації (як у `buildMatchingPrompt`) + інструкція обробити кожен файл
    з `descriptions/` і повернути ОДИН JSON-масив, що об'єднує результати всіх оголошень з
    усіх файлів, формат `[{"id":N,"items":[{"criterion":"...","evidence":"..."}]}]`.
  - Новий `buildChunkListings(listings: PromptListing[]): ChunkListing[]` — для одного чанку:
    `{id, title, characteristics, description}` (characteristics — через `parseParamsLabel`;
    description — `stripHtml` + `MATCHING_DESC_SLICE`).
- [x] `server/src/routes/analysis.ts`:
  - Видалено `GET /api/searches/:id/analyze/package` (старий token-cap branching, «Частина
    N/M»).
  - Додано `GET /api/searches/:id/analyze/package.zip?mode=&ids=`:
    - Валідація search/mode/`NO_CRITERIA` — як у старому ендпойнті.
    - `loadListings` → чанки по `MANUAL_ZIP_CHUNK_SIZE` → для кожного чанку
      `descriptions/chunk-NNN.json` = `JSON.stringify(buildChunkListings(chunk), null, 2)`
      (NNN — 3-значний номер, напр. `chunk-001.json`).
    - `prompt.txt` = `buildManualZipInstructions(criteria, mode)`.
    - `archiver` (`ZipArchive` з v8 API) → `append()` для кожного файлу → `finalize()`, стрім
      у відповідь Fastify (`reply.type(MIME_ZIP)`, `Content-Disposition: attachment;
      filename="analysis-${mode}-search-${id}.zip"`).

## Група 2 — Frontend: крок 2 (ручний режим → ZIP)

- [x] `web/src/api/client.ts`:
  - Видалено `fetchAnalyzePackage`.
  - Додано `fetchAnalyzePackageZip(searchId, mode, ids)` — `fetch` → перевірка `res.ok` →
    `res.blob()` → `downloadBlob(blob, "analysis-${mode}-search-${searchId}.zip")`.
- [x] `web/src/components/analysis/ManualAssistant.tsx`: додано опціональний проп
  `emptyHint?: ReactNode`, що рендериться замість дефолтного «Натисни кнопку нижче, щоб
  підготувати промпт» коли `parts.length === 0`.
- [x] `web/src/components/analysis/AnalysisWizardDialog.tsx`, крок 2:
  - Видалено `matchParts`, `openMatchAssistant`, імпорт `fetchAnalyzePackage`.
  - Кнопка «Ручний режим: підготувати пакет» → «Завантажити ZIP-пакет» (`downloadZipPackage`):
    викликає `fetchAnalyzePackageZip(search.id, mode, effectiveIds)` (guard на
    `effectiveIds.length === 0`, тост як у `runAutoAnalyze`) і встановлює
    `showMatchAssistant = true`.
  - `ManualAssistant` рендериться з `parts={[]}`, `emptyHint` із підказкою прогнати ZIP через
    Claude (Projects/Code за один прохід) і вставити єдиний JSON-результат нижче,
    `onSubmit={handleImportMatching}` — без змін (далі парситься тим самим `/analyze/import`
    + `mergeResults`, підтримує кілька вставок поспіль).

## Група 3 — Frontend: крок 3 (нова таблиця)

- [x] Новий стан у `AnalysisWizardDialog.tsx`:
  - `includedOverrides: Map<string, boolean>` (ключ `` `${id}:${criterion.toLowerCase()}` ``),
    `isIncluded(id, item)` → override ?? `item.ok`, `toggleIncluded(id, item)`.
  - `openDescriptionListing: Listing | null` (для `DescriptionDialog`).
  - Обидва ресетяться в `resetForReopen()`.
- [x] Фільтр: `visibleRows = accumulated.filter(r => r.items.length > 0)`;
  `hiddenCount = accumulated.length - visibleRows.length`. Над таблицею — рядок-підсумок
  «Показано N із M» (+ «приховано K без результатів», якщо `hiddenCount > 0`).
- [x] Layout: `Table.Root size="sm"` (Chakra Table primitives) у `Box maxH="50vh"
  overflowY="auto"`:
  - `Table.Header`: «Оголошення» | «Опис» | мітка режиму (Мінуси/Плюси).
  - На рядок (`visibleRows`):
    - Кл.1: фото (boxSize 12) + назва (`lineClamp={2}`).
    - Кл.2 (`width="50%"`): `DescriptionTooltip` (description, query = evidence
      **включених** items, onClick → `setOpenDescriptionListing(l)`) → `Text lineClamp={3}
      whiteSpace="pre-line"` з `HighlightText` (той самий query).
    - Кл.3: `Wrap` бейджів для **всіх** `r.items` (і ok, і !ok):
      - Стиль за `isIncluded`: включено → `colorPalette={cons?'red':'green'} variant="subtle"`;
        виключено → `colorPalette="gray" variant="outline" textDecoration="line-through"`.
      - `onClick={() => toggleIncluded(r.id, item)}`, `cursor="pointer"`, `role="button"`,
        `tabIndex={0}`, обробка `Enter`/`Space`.
      - Обгорнуто в `Tooltip` (`../ui/tooltip`) з текстом `item.evidence` (якщо не порожній).
      - `!item.ok` — додатковий візуальний маркер (пунктирна рамка), незалежно від
        include-стану.
- [x] Рендер `<DescriptionDialog listing={openDescriptionListing} onClose={...}/>` біля
  `ConfirmActionDialog`.
- [x] `web/src/components/table/DescriptionTooltip.tsx`: розширено тип `query: string` →
  `query: string | string[]` (узгоджено з `HighlightText`; без зміни поведінки для існуючих
  викликів з основної таблиці).

## Група 4 — Крок 4 (commit) і експорт — toggle-стан

- [x] `commitItems`: `r.items.filter(it => it.ok)` → `r.items.filter(it =>
  isIncluded(r.id, it))`.
- [x] `handleExport` (xlsx/json, крок 3): `criteria` рядка — той самий
  `isIncluded`-фільтр (узгоджено з commit).

## Група 5 — Документація

- [x] Цей файл (`docs/plans/analysis-wizard-review-rework.md`).
- [x] `docs/architecture.md` §6: рядок `GET /api/searches/:id/analyze/package?mode=&ids=` →
  `GET /api/searches/:id/analyze/package.zip?mode=&ids=` (ZIP: `prompt.txt` +
  `descriptions/chunk-NNN.json`, 50/чанк).
- [x] `docs/architecture.md` §7: `fetchAnalyzePackage` → `fetchAnalyzePackageZip`.
- [x] `docs/structure.md`: оновлено однорядкові описи `prompts.ts`/`text.ts`/`constants.ts`/
  `routes/analysis.ts`/`client.ts`/`AnalysisWizardDialog.tsx`/`ManualAssistant.tsx`, додано
  `archiver`/`exceljs` у `package.json` (server).
- [x] `CLAUDE.md`: додано `archiver` як другий узгоджений виняток нових залежностей (поруч з
  `exceljs`) — обґрунтування: ZIP-пакет ручного режиму (Node не має вбудованого ZIP-writer).

## Верифікація / test-cases

- [ ] Крок 3: пошук зі змішаними результатами — видно лише рядки з `items.length>0`,
  підсумок «Показано N із M (приховано K)» коректний.
- [ ] Крок 3: таблиця [фото+назва | опис | теги] рендериться для `cons` і `pros`, скрол на
  50vh працює.
- [ ] Hover на описі — tooltip з повним текстом + підсвіткою evidence; клік — модалка
  `DescriptionDialog` з повним текстом (як в основній таблиці).
- [ ] Toggle: клік на включений тег (ok=true) → виключає (сірий/strikethrough), evidence
  зникає з підсвітки опису; клік на виключений тег (ok=false, strikethrough) → включає
  (кольоровий), evidence підсвічується в описі (якщо збігається з текстом).
- [ ] Hover на тезі показує tooltip з цитатою `evidence`.
- [ ] Крок 2: «Завантажити ZIP-пакет» дає `.zip` з `prompt.txt` + `descriptions/chunk-001.json`
  (і далі за потреби) — розпакувати й перевірити вміст.
- [ ] Прогнати ZIP через Claude (вручну користувачем) → вставити єдиний JSON-результат у
  крок 2 → «Додати відповідь» → результати з'являються на кроці 3 (evidence + ok).
- [ ] Крок 4: commit пише лише `isIncluded`-критерії (toggled-off не пишуться, toggled-on
  з ok=false — пишуться).
- [ ] Excel/JSON-експорт кроку 3 відображає toggle-стан.
- [ ] Auto-режим (`/analyze`, якщо є ключ) працює без регресій після рефакторингу
  `prompts.ts`.
- [x] `npm run build` (server) проходить TS strict з `archiver`/`@types/archiver`.
- [x] `npm run build` (web) проходить (tsc + vite).

## Інваріанти (без змін)
- `evidence` НЕ зберігається в БД — commit пише лише `criteria: string[]`.
- Аналіз лишається ручним (ніколи авто).
- PII не йде в LLM (поля чанку: `id/title/characteristics/description`).
- Єдине джерело промптів — `prompts.ts`.

## Коміти
1. `feat: rework manual analysis package as ZIP (prompt + chunked description files)` —
   Група 1 + 2 + `archiver` + CLAUDE.md.
2. `feat: rework AI wizard step 3 — table layout, filtering, manual criteria toggle, evidence highlighting` —
   Група 3 + 4.
3. `docs: update architecture/structure for analysis wizard rework` — Група 5.
