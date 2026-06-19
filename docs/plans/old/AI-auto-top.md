# AI Вибір позицій — план реалізації

## Контекст

Користувач уже має LLM-аналіз мінусів/плюсів для оголошень. Мета — додати окремий таб «AI Вибір», який автоматично відфільтровує оголошення **без мінусів**, сортує їх за ціною і відправляє на AI-ранжування через OpenRouter. AI читає описи/параметри/плюси і повертає впорядкований список із поясненнями (чому оголошення гарне або не ідеальне). Результат відображається як **картки з поясненнями** у діалозі та **нова колонка «AI Ранг»** у самій таблиці.

---

## Рішення

### Контекстна мета
Завдання — **максимально звузити підмножину**: зі сотень оголошень отримати 3–5 найкращих кандидатів для реального розгляду і можливої покупки. AI не просто ранжує всіх — він активно відсіює і залишає лише найсильніші варіанти.

### Алгоритм відбору кандидатів
- `cons = ''` + `status NOT IN ('disabled','rejected')` + `filtered_out = 0`
- Сортування: ціна зростання (`NULL`-ціна в кінці)
- Ліміт: 30 оголошень на вхід в LLM (щоб вміститись в контекст)

### Що робить AI
- Отримує список до 30 кандидатів: `id, title, price, city, params, description, pros` (без PII продавця)
- **Завдання AI:** вибрати **3–5 найкращих** і пояснити чому саме вони — решту ігнорувати
- Відповідь: `{"picks": [{"id": N, "rank": 1, "reason": "..."}], "summary": "Загальний висновок"}` — лише вибрані id
- Поля у БД: `ai_rank` (NULL для не-вибраних) + `ai_pick_reason` + `ai_ranked_at`
- Промпт підкреслює: «обери лише найкращі варіанти — будь готовий відкинути всіх, якщо жоден не відповідає критеріям якості»

### Узгодження з наявними патернами

#### 1. 2-фазний потік запису (як наявний `analyze`)
`rank`/`import` повертають picks для перегляду й **не пишуть у БД**. Окремий `commit`-ендпойнт робить UPDATE у транзакції. Еталон — `routes/analysis/matching.ts` (rank/import без запису) + `routes/analysis/commit.ts` (UPDATE).

Ендпойнти:
- `GET  /api/searches/:id/ai-picks/prompt`  — повертає готовий промпт для ручного режиму
- `POST /api/searches/:id/ai-picks/rank`    — SELECT кандидатів → OpenRouter → повертає `PickResult` **без запису у БД**
- `POST /api/searches/:id/ai-picks/import`  — parse ручної відповіді → повертає `PickResult` **без запису у БД**
- `POST /api/searches/:id/ai-picks/commit`  — UPDATE `ai_rank/ai_pick_reason/ai_ranked_at` у транзакції; `NULL` для всіх не-вибраних цього пошуку

#### 2. UX: модалка-діалог (як `AnalysisWizardDialog.tsx`)
Кнопка «AI Вибір» поряд з наявною AI-кнопкою відкриває `DialogRoot`. Всередині: запуск (авто/ручний), перегляд карток ТОП-5, кнопка «Зберегти» → commit. Панелі над таблицею немає.

#### 3. Ручний режим: reuse `ManualAssistant.tsx`
Передати промпт як `parts=[{name: 'AI Вибір', content: prompt}]` і `onSubmit(raw) → import → commit`. Новий `AiPicksManual.tsx` не потрібен.

---

## Кроки реалізації

### 1. DB — нові колонки (schema.sql + db.ts)

**`server/src/db/schema.sql`** — додати до `CREATE TABLE listings`:
```sql
ai_rank INTEGER,
ai_pick_reason TEXT,
ai_ranked_at TEXT
```

**`server/src/db/db.ts`** — додати 3 виклики `addColumnIfMissing` **після рядка ~135** (одразу після `analysis_stale` — **НЕ** в `LISTINGS_COMMON_COLUMNS`, щоб вижити при rebuild через `user_version`):
```ts
addColumnIfMissing('listings', 'ai_rank', 'INTEGER');
addColumnIfMissing('listings', 'ai_pick_reason', 'TEXT');
addColumnIfMissing('listings', 'ai_ranked_at', 'TEXT');
```

### 2. Backend — типи (server/src/types.ts)

Додати до `ListingRow`:
```ts
ai_rank: number | null;
ai_pick_reason: string | null;
ai_ranked_at: string | null;
```

Нові типи (аналоги наявних `PromptListing`/`MatchResult`):
```ts
interface PickCandidate {
  id: number; title: string; price: number | null; city: string | null;
  params: string | null; description: string | null; pros: string;
}
interface PickItem   { id: number; rank: number; reason: string; }
interface PickResult { picks: PickItem[]; summary: string; }
```

### 3. Backend — GET /listings: додати нові колонки (server/src/routes/listings.ts)

GET /listings використовує **білий список** `LISTING_COLUMNS` (рядки 15-19) — НЕ `SELECT *`. Нові колонки не потраплять у відповідь автоматично. Дописати в константу:
```ts
'ai_rank', 'ai_pick_reason', 'ai_ranked_at'
```
Опційно додати `'ai_rank'` у `SORTABLE` (рядки 6-13), якщо знадобиться серверне сортування.

### 4. Backend — новий модуль `server/src/analysis/aiPicks.ts`

Еталон: `analysis/prompts.ts` (`buildMatchingPrompt`) + `analysis/parse.ts` (`parseMatchingResponse`) + `analysis/openrouter.ts` (`chat(messages, options)`).

- `buildPickPrompt(candidates: PickCandidate[]): string`
  — серіалізує кандидатів у JSON з полями `id/title/price/city/params/description/pros` (без PII продавця)
  — очікувана відповідь: `{"picks": [{"id": N, "rank": 1, "reason": "..."}], "summary": "..."}`
- `parsePickResponse(raw: string, validIds: number[]): PickResult`
  — `stripCodeFence` → `JSON.parse` → валідація: `picks[].id ⊂ validIds` (анти-галюцинація)

### 5. Backend — новий repo-хелпер `server/src/analysis/repo.ts`

Наявний `loadListings` повертає лише `id/title/description/params` — для ai-picks бракує `price/city/pros`. Додати:
```ts
export function loadPickCandidates(db: Database, searchId: number): PickCandidate[] {
  return db.prepare(`
    SELECT id, title, price, city, params, description, pros
    FROM listings
    WHERE search_id = ? AND cons = '' AND status NOT IN ('disabled','rejected')
      AND filtered_out = 0
    ORDER BY CASE WHEN price IS NULL THEN 1 ELSE 0 END, price ASC
    LIMIT 30
  `).all(searchId) as PickCandidate[];
}
```

### 6. Backend — нові роути `server/src/routes/aiPicks.ts`

Fastify generics `app.get<{Params}>` / `app.post<{Params, Body}>`, `reply.code(...).send(...)`.

```
GET  /api/searches/:id/ai-picks/prompt  → { prompt: string }
POST /api/searches/:id/ai-picks/rank    → PickResult  (loadPickCandidates → chat() → parsePickResponse; без запису в БД)
POST /api/searches/:id/ai-picks/import  → PickResult  (body.raw → parsePickResponse; без запису в БД)
POST /api/searches/:id/ai-picks/commit  → { committed: number }
     body: { picks: PickItem[] }
     db.transaction: UPDATE ai_rank/ai_pick_reason/ai_ranked_at для вибраних;
     SET ai_rank=NULL, ai_pick_reason=NULL для всіх інших цього search_id
```

**Реєстрація** в `server/src/index.ts`:
```ts
import { aiPicksRoutes } from './routes/aiPicks.js';
await app.register(aiPicksRoutes);
```

### 7. Frontend — типи (web/src/types/index.ts)

Додати до інтерфейсу `Listing`:
```ts
ai_rank: number | null;
ai_pick_reason: string | null;
ai_ranked_at: string | null;
```

### 8. Frontend — API хуки (web/src/api/client.ts)

Еталон: `useAnalyze` (рядок 291), `useImportAnalysis` (330), `useCommitAnalysis` (~351), `fetchCriteriaPrompt` (259).

```ts
fetchAiPicksPrompt(searchId: number): Promise<{ prompt: string }>
  // GET /api/searches/:id/ai-picks/prompt (функція, не хук)

useRunAiPicks()
  // POST /api/searches/:id/ai-picks/rank → PickResult

useImportAiPicks()
  // POST /api/searches/:id/ai-picks/import → PickResult

useCommitAiPicks()
  // POST /api/searches/:id/ai-picks/commit
  // onSuccess: queryClient.invalidateQueries(['listings', searchId])
```

### 9. Frontend — тип фільтра (web/src/stores/listingsUiStore.ts)

Змінити тип поля `statusFilter`:
```ts
// було:  ListingStatus | 'all'
// стає:  ListingStatus | 'all' | 'ai_picks'
```

### 10. Frontend — таб у FilterBar (web/src/components/table/topbar/ListingsFilterBar.tsx)

Додати елемент у масив `items` (рядки 38-44; Chakra `SegmentGroup.Items`, не `<Segment>`):
```ts
{ value: 'ai_picks', label: 'AI Вибір',
  count: listings.filter(l =>
    !l.cons && !isMutedStatus(l.status) && l.filtered_out === 0).length }
```
Імпортувати `isMutedStatus` з `utils/status.ts` (приймає `string`-статус, не об'єкт listing).  
`onValueChange` каст `d.value as typeof statusFilter` вже охоплює новий тип.

### 11. Frontend — логіка таблиці (web/src/pages/ListingsTable.tsx)

**Фільтрація** у `visibleRows` (рядки 77-85): додати гілку `ai_picks`:
```ts
statusFilter === 'ai_picks'
  ? rows.filter(l => !l.cons && !isMutedStatus(l.status) && l.filtered_out === 0)
  : rows.filter(l => (showFilteredOut || l.filtered_out === 0)
      && (statusFilter === 'all' || l.status === statusFilter))
```

**Авто-показ колонки + дефолт-сортування** (⚠️ прихована складність: `columnVisibility` і `sorting` persist-яться у `useListingsTableState`):
```ts
useEffect(() => {
  if (statusFilter === 'ai_picks') {
    setColumnVisibility(v => ({ ...v, ai_rank: true }));
    setSorting([{ id: 'price', desc: false }]);
  } else {
    setColumnVisibility(v => ({ ...v, ai_rank: false }));
  }
}, [statusFilter]);
```

### 12. Frontend — колонка «AI Ранг» (web/src/components/table/columns.tsx)

```ts
columnHelper.accessor('ai_rank', {
  header: () => <HeaderLabel>AI Ранг</HeaderLabel>,
  size: 80, minSize: 60, maxSize: 100,
  enableSorting: true, sortDescFirst: false,
  cell: info => {
    const rank = info.getValue();
    if (rank == null) return null;
    return (
      <Tooltip content={info.row.original.ai_pick_reason ?? ''}>
        <span>#{rank}</span>
      </Tooltip>
    );
  },
})
```

Додатково:
- **`web/src/utils/storage.ts`** → `loadColumnVisibility()` → `defaults`: додати `ai_rank: false`
- **`TOGGLEABLE_COLUMNS`** (columns.tsx:235-248): додати `{ id: 'ai_rank', label: 'AI Ранг' }` (інакше колонка не з'явиться в перемикачі налаштувань)

### 13. Frontend — AiPicksDialog (web/src/components/analysis/AiPicksDialog.tsx)

Новий компонент за зразком `AnalysisWizardDialog.tsx`: `DialogRoot`-модалка, кнопка-тригер поряд з наявною AI-кнопкою у хедері.

Внутрішні стани: `step` (idle → running → done), `pendingPicks: PickItem[]`.

```
Стан idle:
  - кнопка «Запустити AI ранжування» → useRunAiPicks → step=running
  - секція «Ручний режим»:
      <ManualAssistant
        parts={[{ name: 'AI Вибір', content: prompt }]}
        onSubmit={raw => importAiPicks({ searchId, raw }) → step=done}
      />

Стан running:
  - spinner + «Аналізую N оголошень…»

Стан done:
  - список <AiRankCard> для pendingPicks
  - кнопка «Зберегти результат» → useCommitAiPicks → invalidate → закрити
```

### 14. Frontend — AiRankCard (web/src/components/analysis/AiRankCard.tsx)

Стиль: `<Box borderWidth="1px" borderColor="border.subtle" rounded="md" p={3}>` — узгоджено з мобільним-режимом wizard (**`Card.Root` не використовується** у проєкті).

Поля: `#rank`, `title` (лінк на OLX), `price`, `city`, коротко `pros` (1–2 рядки), `ai_pick_reason`.

---

## Критичні файли

| Файл | Дія |
|---|---|
| `server/src/db/schema.sql` | +3 колонки `ai_rank`, `ai_pick_reason`, `ai_ranked_at` |
| `server/src/db/db.ts` | 3× `addColumnIfMissing` після рядка ~135 (не в COMMON_COLUMNS) |
| `server/src/types.ts` | +3 поля `ListingRow`; нові типи `PickCandidate`, `PickItem`, `PickResult` |
| `server/src/routes/listings.ts` | дописати 3 колонки в `LISTING_COLUMNS` (рядки 15-19) |
| `server/src/analysis/aiPicks.ts` | новий — `buildPickPrompt` + `parsePickResponse` |
| `server/src/analysis/repo.ts` | новий хелпер `loadPickCandidates` |
| `server/src/analysis/openrouter.ts` | еталон `chat()` (не змінювати) |
| `server/src/analysis/prompts.ts` | еталон `buildMatchingPrompt` (не змінювати) |
| `server/src/analysis/parse.ts` | еталон `parseMatchingResponse` (не змінювати) |
| `server/src/routes/aiPicks.ts` | новий — 4 ендпойнти (prompt/rank/import/commit) |
| `server/src/routes/analysis/matching.ts` | еталон rank/import без запису (не змінювати) |
| `server/src/routes/analysis/commit.ts` | еталон UPDATE-транзакції (не змінювати) |
| `server/src/index.ts` | реєстрація `aiPicksRoutes` |
| `web/src/types/index.ts` | +3 поля `Listing` |
| `web/src/api/client.ts` | +4 хуки/функції |
| `web/src/stores/listingsUiStore.ts` | тип `statusFilter` + `'ai_picks'` |
| `web/src/components/table/topbar/ListingsFilterBar.tsx` | новий елемент `items`; `isMutedStatus` |
| `web/src/utils/status.ts` | еталон `isMutedStatus(status: string)` (не змінювати) |
| `web/src/pages/ListingsTable.tsx` | гілка `ai_picks` у `visibleRows`; ефект видимості/сортування |
| `web/src/components/table/columns.tsx` | нова колонка `ai_rank` + `TOGGLEABLE_COLUMNS` |
| `web/src/utils/storage.ts` | `defaults.ai_rank = false` у `loadColumnVisibility` |
| `web/src/components/analysis/AiPicksDialog.tsx` | новий (DialogRoot, idle/running/done) |
| `web/src/components/analysis/AiRankCard.tsx` | новий (Box borderWidth, не Card.Root) |
| `docs/plans/AI-auto-top.md` | цей файл |
| `docs/architecture.md` | оновити після реалізації |
| `docs/structure.md` | оновити після реалізації |

---

## Зміна після впровадження (2026-06-17): ширший пул кандидатів + топ-30 замість 3-5

Користувач мав ~4000 оголошень, з яких 1500 уже отримали мінуси (виключені з пулу за задумом).
Зі решти діалог показував повну кількість кандидатів без обмеження, а в промпт фактично йшло
лише 30 найдешевших (`LIMIT 30`) — UI-текст не попереджав про обрізання, що й спричинило
плутанину («чому з ~2500 кандидатів я не бачу результату по більшості»).

Рішення:
- `PICK_CANDIDATES_LIMIT = 500` (було `30`, хардкод) — `server/src/analysis/constants.ts`,
  застосовується в `loadPickCandidates` (`server/src/analysis/repo.ts`) як параметр `LIMIT ?`
  замість захардкодженого числа.
- `PICK_TOP_N = 30` — задача LLM змінена з «обери 3–5 найкращих» на «обери і відсортуй
  топ-30 з пулу до 500» (`buildPickPrompt`, `server/src/analysis/aiPicks.ts`). `parsePickResponse`
  додатково обрізає відповідь до `PICK_TOP_N` після сортування за `rank` — захист, якщо LLM
  поверне більше.
- Дзеркальні константи на фронтенді — `web/src/constants.ts`. Діалог (`AiPicksDialog.tsx`)
  тепер явно показує, скільки кандидатів реально піде в промпт (`min(candidateCount, 500)`)
  і що AI поверне топ-30 — без прихованого обрізання.
- Не змінено: обрізання тексту (`MAX_DESC_CHARS=1200`, `MAX_PROS_CHARS=400` в `aiPicks.ts`) —
  при 500 кандидатах промпт може вийти дуже великим (сотні тисяч символів); для авто-режиму
  (Gemini Flash Lite, контекст 1M токенів) це працює, але для ручного режиму (вставка в чат
  зі звичайним лімітом контексту) користувачу може знадобитись менший ліміт кандидатів.

## Зміна: ZIP-пакет (map-reduce) для ручного режиму з великими пулами

Після підняття `PICK_CANDIDATES_LIMIT` до 500 ручний режим (вставка одного промпту в
безкоштовний чат) став непрактичним — текст на сотні тисяч символів. На відміну від matching
тут немає детерміністичного `analyze.py` (відбір — завжди судження LLM), тож пряме копіювання
структури matching-ZIP (один скрипт обробляє всі чанки автоматично) не підходить.

Рішення — **map-reduce у 2 етапи всередині самого ручного промпту/агента**, без нової логіки
накопичення в UI (на відміну від matching, де `accumulated` зберігається в React-стейті між
кількома вставками):

- `MANUAL_PICKS_ZIP_CHUNK_SIZE = 50`, `PICKS_NOMINEES_PER_CHUNK = 10` —
  `server/src/analysis/constants.ts`.
- `GET /api/searches/:id/ai-picks/package.zip` (`server/src/routes/aiPicks.ts`) — ZIP з:
  - `prompt.txt` (`buildPickManualZipInstructions`, `server/src/analysis/aiPicks.ts`) —
    інструкція: етап 1 — для кожного `candidates/chunk-NNN.json` обрати до 10 номінантів
    (промiжний результат, не виводити); етап 2 — після ВСІХ файлів об'єднати номінантів і
    вивести ОДИН фінальний JSON `{picks, summary}` з топ-30.
  - `candidates/chunk-NNN.json` × `ceil(N/50)` — серіалізовані кандидати
    (`toPickItems`, винесено з `buildPickPrompt` для повторного використання).
- `buildPickPrompt(candidates, topN)` тепер приймає `topN` — той самий генератор використовується
  і для одноразового промпту (топ-30 з ≤500), і для майбутніх map/reduce варіантів за потреби.
- Фронтенд: `useZip = promptCount > MANUAL_PICKS_ZIP_CHUNK_SIZE` в `AiPicksDialog.tsx` — коли
  кандидатів більше 50, замінює кнопку «Завантажити промпт» на «Завантажити ZIP-пакет»
  (`fetchAiPicksPackageZip`, `web/src/api/client.ts`); кінцева вставка відповіді — той самий
  `handleImport`/`/ai-picks/import`, що й раніше (без змін на бекенді цього ендпойнта) — весь
  map-reduce користувач/агент проганяє сам у чаті за один сеанс і повертає в застосунок лише
  ОДИН фінальний JSON.

## Верифікація

1. Запустити `npm run dev`
2. Відкрити пошук, виконати AI-аналіз плюсів/мінусів для кількох оголошень
3. Перейти на таб «AI Вибір» — перевірити, що відображаються лише оголошення без мінусів; колонка `ai_rank` стає видимою; сортування — ціна ASC
4. Натиснути кнопку «AI Вибір» (відкривається діалог) → «Запустити AI ранжування» → spinner → картки `AiRankCard` з'являються (без запису у БД ще)
5. Натиснути «Зберегти результат» → таблиця оновлюється; колонка `ai_rank` показує `#1`/`#2`/`#3`; tooltip — `ai_pick_reason`
6. Ручний режим (≤50 кандидатів): відкрити діалог → «Ручний режим» → `ManualAssistant` показує кнопку «Копіювати» → скопіювати промпт → вставити у чат → вставити відповідь у textarea → «Застосувати» → import → картки → «Зберегти»
7. Ручний режим (>50 кандидатів): «Завантажити ZIP-пакет» → перевірити структуру архіву (`prompt.txt` + `candidates/chunk-NNN.json`) → прогнати через агента з підтримкою файлів → вставити єдиний фінальний JSON → import → картки → «Зберегти»
8. Перейти на інший таб — колонка `ai_rank` ховається; повернутись на «AI Вибір» — знову показується
9. `GET /api/searches/:id/ai-picks/prompt` повертає валідний промпт; `GET .../package.zip` повертає валідний ZIP; `POST .../rank` без ключа OpenRouter → 409 (як `/analyze`)
