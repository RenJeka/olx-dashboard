# План: AI Flow — поточна вкладка як scope, вибір лише на кроці 1, збереження прогресу (Zustand)

## Context

Користувач просить три зміни в майстрі AI-аналізу (`AnalysisWizardDialog`) і прямо обрав
**Zustand** як state-manager (раніше в проєкті його не було; CLAUDE.md забороняє Redux, але
Zustand не згадано — додаємо за явним підтвердженням користувача) та **in-memory**
збереження прогресу (переживає закриття/повторне відкриття модалки в межах сесії; губиться
при повному refresh сторінки):

1. **Поточна вкладка як третій scope.** Зараз scope = «Вибрані» / «Весь пошук». Треба додати
   третю опцію — поточну вкладку фільтра статусів (напр. «Нове»/«Цікаво»), що показується
   поряд з двома наявними і відображає лише назву вкладки. Вкладка (`statusFilter`) зараз
   локальна в `ListingsTable` — її треба зробити спільною (через Zustand-стор), щоб майстер у
   `Header` її бачив.
2. **Вибір режиму (Мінуси/Плюси) і scope — лише на кроці 1.** Зараз обидва перемикачі в
   `DialogHeader` і видимі на всіх кроках. Перенести їх у тіло кроку 1; на кроках 2–4 —
   лише компактний read-only підсумок.
3. **Збереження прогресу Flow.** Зараз `resetForReopen()` стирає прогрес при кожному
   відкритті. Тримати прогрес у Zustand-сторі (in-memory) — закриття/повторне відкриття не
   губить крок/критерії/результати. Додатково заборонити закриття кліком повз вікно
   (`closeOnInteractOutside={false}`). Скидання — лише після завершення Flow (commit на
   кроці 4) або кнопкою «Почати заново».

## Передумови (з дослідження коду)

- `AnalysisWizardDialog.tsx` (~845 рядків): компонент лишається змонтованим, поки є
  `selectedSearch`; модалка лише перемикає `open`. Прогрес губиться тільки через
  `resetForReopen()` (рядки 143-154), що викликається в `onOpenChange` при `d.open` (рядок 513).
- scope-стан: `useState<'selected' | 'all'>` (рядки 89-91); `effectiveIds = scope === 'selected'
  ? selectedIds : allIds` (рядок 129). Перемикачі mode/scope — у `DialogHeader` (рядки 554-578).
- Критерії підвантажуються ефектом (рядки 136-141) при `open`/зміні `mode` — треба не
  затирати прогрес при resume.
- `statusFilter` живе в `ListingsTable.tsx` (`useState<ListingStatus | 'all'>('all')`, рядок 52),
  використовується у `visibleRows` (рядки 75-82) і передається в `ListingsFilterBar`
  (props `statusFilter`/`onStatusFilterChange`). `STATUS_LABELS`/`LISTING_STATUSES` —
  `web/src/utils/status.ts`, `web/src/types/index.ts`.
- `Chakra Dialog.Root` (re-export у `web/src/components/ui/dialog.tsx`) приймає
  `closeOnInteractOutside` напряму (наразі ніде не використовується).
- Zustand НЕ встановлено (`web/package.json`). localStorage-патерн — `web/src/utils/storage.ts`
  (для in-memory НЕ потрібен).

## Зміни

### 0. Залежність + документ плану (першими)
- `npm install zustand -w web` (додати в `web/package.json`). Якщо реєстр недоступний у
  remote-середовищі — повідомити користувача (це блокер для всього підходу).
- Створити цей файл як `docs/plans/ai-flow-zustand-tab-scope.md` (копія цього плану).

### 1. Нові Zustand-стори (`web/src/stores/`)
- **`listingsUiStore.ts`** → `useListingsUiStore`: `statusFilter: ListingStatus | 'all'`
  (дефолт `'all'`) + `setStatusFilter`. Спільне джерело вкладки для таблиці й майстра.
- **`analysisWizardStore.ts`** → `useAnalysisWizardStore`: прогрес-стан Flow +
  `boundSearchId: number | null`, `criteriaLoadedMode: AnalysisMode | null`.
  Поля прогресу (тип як зараз, **Set/Map лишаються** — in-memory, серіалізація не потрібна):
  `mode`, `scope` (тепер `'selected' | 'all' | 'tab'`), `step`, `available: string[]`,
  `selected: Set<string>`, `customInput`, `accumulated: AnalyzedListing[]`,
  `includedOverrides: Map<string, boolean>`. Сетери приймають **value-or-updater**
  (`T | (prev: T) => T`), щоб виклики виду `setSelected(prev => …)` у компоненті лишились без
  змін. Дії: `bindSearch(id)` — якщо `id !== boundSearchId`, скидає Flow до initial і ставить
  `boundSearchId=id`, `criteriaLoadedMode=null`; `reset()` — повне скидання Flow.
  Ephemeral-UI (`showCriteriaAssistant`, `criteriaParts`, `showMatchAssistant`,
  `zipDownloading`, `analyzeProgress`, `commitProgress`, `openDescriptionListing`,
  `confirmOverwrite`, `open`) **лишаються локальним `useState`** у компоненті (скидання при
  remount прийнятне).

### 2. `ListingsTable.tsx` + `ListingsFilterBar.tsx`
- Прибрати локальний `statusFilter` useState; читати/писати через `useListingsUiStore`.
- `visibleRows` (рядки 75-82) бере `statusFilter` зі стора.
- `ListingsFilterBar` читає `statusFilter`/`setStatusFilter` зі стора напряму — прибрати
  відповідні props (`statusFilter`/`onStatusFilterChange`) з виклику в `ListingsTable`.

### 3. `AnalysisWizardDialog.tsx` (основне)
- Замінити flow-`useState` на селектори `useAnalysisWizardStore`; ephemeral лишити локальними.
- `scope` тип → `'selected' | 'all' | 'tab'`. Прочитати `statusFilter` з `useListingsUiStore`.
  `effectiveIds`:
  - `'selected'` → `selectedIds`
  - `'tab'` → `allIds.filter(id => listingById.get(id)?.status === statusFilter)`
    (якщо `statusFilter === 'all'` — fallback на `allIds`)
  - `'all'` → `allIds`
- **Перемикачі mode/scope перенести в тіло кроку 1** (на початок `step === 1`). Третя
  scope-кнопка «вкладка» рендериться лише коли `statusFilter !== 'all'`:
  лейбл `STATUS_LABELS[statusFilter] (N)`, де `N` = к-сть оголошень із цим статусом.
  На кроках 2–4 — read-only підсумок у хедері (напр. «Мінуси · Вибрані (3)»), без кнопок.
- Дефолт scope при свіжому Flow: `selectedIds.length>0 ? 'selected' : statusFilter!=='all' ? 'tab' : 'all'`.
- `DialogRoot`: додати `closeOnInteractOutside={false}` (X і Esc лишаються робочими — прогрес
  усе одно зберігається). В `onOpenChange`: прибрати `resetForReopen()`; при `d.open` викликати
  `bindSearch(search.id)` (скине Flow лише якщо змінився пошук).
- Критерії-ефект (рядки 136-141): підвантажувати `savedCriteria[mode]` лише коли
  `step === 1 && mode !== criteriaLoadedMode` (тоді ставити `available`/`selected` і
  `criteriaLoadedMode=mode`). Оскільки mode тепер змінюється лише на кроці 1 — резюме Flow на
  кроках 2–4 не затирається.
- Після успішного commit (крок 4) — викликати `reset()` (Flow завершено). Додати кнопку
  «Почати заново» (крок 1) → `reset()` + повторний `bindSearch`.
- Прибрати функцію `resetForReopen()`.

### 4. Документація
- **CLAUDE.md** — у секції «Стек» додати Zustand як узгоджений state-manager для клієнтського
  UI-стану (вкладка фільтра + прогрес AI-Flow); зазначити in-memory (без persist).
- **docs/architecture.md** — нова секція/нотатка про `web/src/stores/` (два стори, призначення),
  оновити опис `AnalysisWizardDialog` (scope=вкладка, вибір лише на кроці 1, збереження
  прогресу, блокування закриття) і `ListingsFilterBar`/`ListingsTable` (statusFilter зі стора).
- **docs/structure.md** — додати теку `web/src/stores/` з двома файлами.

## Верифікація
- `cd web && npx tsc -b` — типи; `npm run build` — TS strict + vite build.
- Ручна перевірка (dev: `npm run dev:server` + `npm run dev:web`):
  1. Обрати вкладку «Цікаво» → відкрити AI → на кроці 1 поряд із «Вибрані»/«Весь пошук» є
     кнопка «Цікаво (N)»; обрати її → аналіз іде лише по оголошеннях зі статусом `interested`.
  2. Перемикачі Мінуси/Плюси та scope присутні **лише** на кроці 1; на кроках 2–4 — read-only
     підсумок.
  3. Пройти до кроку 3, закрити модалку (X) і відкрити знову → крок/критерії/результати
     збережені (не скинулись). Клік повз вікно НЕ закриває модалку.
  4. Завершити Flow (commit на кроці 4) → повторне відкриття стартує з чистого кроку 1.
  5. Перемкнути пошук під час незавершеного Flow → відкриття AI показує чистий Flow для нового
     пошуку (bindSearch скинув).
  6. Регрес: фільтр вкладок таблиці працює як раніше; вибір рядків (selectedIds) → scope
     «Вибрані» коректний.

## Інваріанти (без змін)
- Аналіз лишається ручним (ніколи авто). `evidence` НЕ зберігається в БД. Єдине джерело
  промптів — `prompts.ts`. PII продавця в промпт не йде.

## Коміти (запропоновані, англ.)
1. `chore: add zustand; introduce listings-ui and analysis-wizard stores`
2. `feat: AI flow — current-tab scope, mode/scope only on step 1, persist progress in-memory`
3. `docs: document zustand stores and AI flow changes (architecture/structure/CLAUDE)`
