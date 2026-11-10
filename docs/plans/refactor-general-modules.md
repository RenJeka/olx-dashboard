# Рефакторинг: «дещо універсальні» модулі (аудит + план)

> **Статус:** 🟢 активний · аудит 2026-11-10, виконання чекає «так» людини

## Контекст

Запит людини (2026-11-10): скілом `code-modules-refactor` знайти модулі, підігнані під одного викликача
(функції-близнюки, прапорці-перемикачі, обгортки без глибини), взяти 2–3 найпоказовіші й відрефакторити; що можна —
винести у файли конфігурації.

**Головне правило:** поведінка не змінюється — ті самі HTTP-коди, тексти помилок, вміст ZIP, ті самі SQL-запити.

Обсяг аудиту — `server/src` і `web/src`. Сканер і скрейпер не чіпаємо: їх рефакторинг відкладено рішенням людини
(фази 5–6 [refactor-clean-architecture](refactor-clean-architecture.md)). Звіт і план — в одному файлі за конвенцією
проєкту (`AGENTS.md` → «Плани»), а не в `docs/refactor-audit/`, як пропонує скіл.

Вихідний стан (2026-11-10, гілка `ccr-0b71569c-84hgso`): `npm run check` зелений; `layers:check` показує відомі
порушення лише в сканері й скрейпері.

## Карта модулів (обрані представники)

| Модуль | Шар | Точки входу | Викликачі |
|---|---|---|---|
| AI-маршрути: `routes/relevance.ts`, `routes/aiPicks.ts`, `routes/searchSynonyms.ts`, `routes/analysis/matching.ts`, `routes/analysis/criteria.ts` | верхній (HTTP) | ендпойнти `/api/searches/:id/…` | фронтенд |
| `web/src/api/base.ts` | нижній (HTTP-клієнт) | `api`, `apiBlob`, `ApiError` | 67 викликів у `web/src/api/*`, `auth/` |
| Обсяг AI-кроків: `utils/aiScope.ts`, `utils/analysis.ts`, `hooks/analysis/useAiScope.ts`, `hooks/analysis/useAnalysisScope.ts` | нижній (утиліти, хук) | `getScopeIds`, `getScopeCounts`, `getDefaultScope`, `buildScopeLabel`, `computeDefaultScope`, два хуки | `useRelevanceFlow`, `useAiPicksFlow`, `useWizard`, `ScopeSelector` |

## Знахідки

### 1. AI-маршрути сервера — близнюки й розкидані тексти помилок

- **Зараз:** кожен ендпойнт сам повторює ті самі кроки:
  - «знайти пошук або 404» — `if (!(await getSearch(id))) return reply.code(404).send(…)` — 24 рази у 4 файлах;
  - розбір `ids` — `Array.isArray(req.body.ids) ? req.body.ids.map(Number).filter(Number.isFinite) : []` — 6 разів;
  - «немає ключа → 409» — 6 разів;
  - `err instanceof Error ? err.message : String(err)` — 11 разів;
  - збирання ZIP (архів → обробник помилки → файли → чанки з номером `NNN` → заголовки → відправка) — 3 копії;
  - тексти `SEARCH_NOT_FOUND`, `NO_API_KEY`, `EMPTY_RESPONSE` оголошено окремо в `relevance.ts`, `aiPicks.ts`,
    `searchSynonyms.ts`, хоча вони вже є в `ANALYSIS_ERRORS` (`analysis/constants.ts`).
- **Чому це проблема:** новий AI-ендпойнт копіює п'ять шматків; зміна тексту помилки чи формату ZIP — правка в кількох
  файлах; маршрут на 200 рядків, де суть (що саме робить крок) губиться серед однакової обв'язки.
- **Пропоную** (механізм униз, політика лишається в маршруті):
  - `src/analysis/guards.ts` (сервер): `requireSearch(id): Promise<SearchRow>` (кидає `NotFoundError`),
    `requireApiKey(): void` (кидає `ConflictError`). Глобальний обробник уже відповідає `{ error }` з тим самим кодом.
  - `server/src/errors.ts`: `errorMessage(err: unknown): string`.
  - `src/routes/http.ts` (сервер): `parseIds(raw: unknown): number[]`,
    `sendZip(req, reply, filename, entries: { name: string; content: string | Buffer }[])`,
    `numberedName(prefix, index, ext)` → `descriptions/chunk-001.json`.
  - Маршрут складає свій ZIP списком файлів: `sendZip(req, reply, name, [{ name: 'prompt.txt', content }, …])`.
  - **Конфігурація:** усі тексти помилок AI-маршрутів — у `ANALYSIS_ERRORS` (додаються `NO_TARGET`, `NO_CANDIDATES`,
    `EMPTY_QUERY`, `tooManyIds(max)`); імена файлів ZIP (`prompt.txt`, теки чанків) — константами в
    `analysis/manualZip.ts`.
- **Чотири питання:** (1) чотири малі функції замість п'яти копій у кожному ендпойнті; (2) кожна — у 3–24 місцях;
  (3) виклик коротший за теперішній рядок; (4) так: помічники не знають, який це крок AI.

### 2. `web/src/api/base.ts` — близнюки `api` / `apiBlob` і серіалізація у викликачів

- **Зараз:** `api<T>(path, init)` і `apiBlob(path, init)` — однаковий код (заголовки, кукі, 401 → подія, розбір
  помилки), різниця лише в `.json()` / `.blob()`. Кожен із 41 викликів із тілом сам пише
  `body: JSON.stringify(…)`.
- **Чому це проблема:** дві копії вже розійшлися — `api` кидає `ApiError` зі статусом, `apiBlob` — звичайний `Error`;
  знання «тіло — це JSON-рядок» розмазане по всіх файлах `api/`.
- **Пропоную:** внутрішній `request(path, init): Promise<Response>` (заголовки, кукі, 401, `ApiError`); `api` і
  `apiBlob` — по одному рядку над ним. Параметр `init` приймає `json?: unknown` замість ручного `body`:
  `api<T>(path, { method: 'POST', json: { ids } })`.
- **Чотири питання:** (1) ті самі дві точки входу, одна реалізація; (2) усі запити фронтенду; (3) виклики коротші;
  (4) так.
- **Єдина видима різниця:** помилка завантаження ZIP/xlsx стане `ApiError` (нащадок `Error`, той самий текст) — ніхто
  з викликачів тип не розрізняє.

### 3. Обсяг AI-кроків на фронтенді — дублі хука й утиліт, прапорець під одного викликача

- **Зараз:**
  - `useAnalysisScope` — копія `useAiScope` з кількома зайвими полями (`allIds`, `tabIds`, `tabCount`, `selectedIds`
    ніхто не читає; `scopeLabel` — один споживач);
  - `computeDefaultScope` (`utils/analysis.ts`) — копія `getDefaultScope` (`utils/aiScope.ts`);
  - `buildScopeLabel` у `utils/analysis.ts` — обгортка, що лише передає виклик далі;
  - тип `AnalysisScope` — псевдонім `AiScope`;
  - `getDefaultScope(…, { preferCandidates: true })` — прапорець, з яким функція просто повертає `'candidates'`
    (єдиний викликач — «AI Вибір»).
- **Чому це проблема:** «єдине джерело правди обсягу» (так написано в `aiScope.ts`) насправді існує у двох
  екземплярах; правка правила обсягу потребує двох місць.
- **Пропоную:** один хук `useAiScope` і один набір утиліт у `utils/aiScope.ts`. Майстер аналізу бере `useAiScope` і
  сам рахує підпис (`buildScopeLabel`); «AI Вибір» сам ставить `'candidates'` — прапорець зникає.
  `utils/analysis.ts` лишає тільки `criterionKey` та `isIncludedFn`.
- **Чотири питання:** (1) 1 хук + 5 функцій замість 2 хуків + 7; (2) три AI-діалоги; (3) так; (4) так — політика
  «за замовчуванням найкращі кандидати» переїжджає до «AI Вибір».

### 4. Налаштовувані числа розкидані по файлах (конфігурація)

- **Фронтенд** → `web/src/constants.ts`: паузи автооновлення (`useAutoRefresh.ts`), затримка пошуку
  (`pages/ListingsTable.tsx`), ліміт чипів у клітинці (`ProsConsCell.tsx`), розмір порції деталей
  (`api/listings.ts`), «три дні» (`utils/searchStats.ts`), локаль і часовий пояс (`utils/format.ts`), сегменти
  прогресу (`ScanProgressPanel.tsx`).
- **Сервер** → новий `src/constants.ts` (сервер): ліміти журналу й оголошень (`services/logs.ts`,
  `services/listings.ts`), зберігання журналу (`logger.ts`), таймаути Redis (`cache/redis.ts`), ширини Excel
  (`export/xlsx.ts`).
- Значення не змінюються, лише місце оголошення.

## Не змінюємо (і чому)

- **Сканер і скрейпер** (включно з їх константами й ретраями) — відкладено рішенням людини, є окремий план.
- **`analysis/openrouter.ts` ↔ `analysis/jev.ts`** — схожі заголовки запиту, але різні правила повтору й розбору;
  спільний примітив дав би узагальнення заради двох викликачів.
- **Імена файлів ZIP усередині текстів промптів** — промпти мають лишитися байт-у-байт (інваріант AI).
- **Константи, продубльовані між `server` і `web`** — свідома конвенція «без build-зчеплень» (`AGENTS.md`).
- **`useRelevanceFlow` ↔ `useAiPicksFlow`** — схожа форма (run / import / commit), але різний стан і кроки; спільний
  «рушій AI-діалогу» був би надмірним узагальненням.
- **Логіка всередині маршрутів** (цикл чанків у `matching.ts`, злиття в `relevance/import`) — це перенесення в
  сервіси, тема плану чистої архітектури.

## Кроки

Кожна порція — окремий коміт після зеленого `npm run check` + `npm run build`.

### Порція 1 — низький ризик: обсяг AI-кроків (знахідка 3)

- [x] 1.1 `useWizard` → `useAiScope`; підпис обсягу рахується в `useWizard`
- [x] 1.2 Видалити `useAnalysisScope.ts`, `computeDefaultScope`, обгортку `buildScopeLabel`, псевдонім `AnalysisScope`
- [x] 1.3 Прибрати прапорець `preferCandidates`; «AI Вибір» ставить `'candidates'` сам

### Порція 2 — низький ризик: HTTP-клієнт фронтенду (знахідка 2)

- [x] 2.1 `request()` у `api/base.ts`; `api` і `apiBlob` поверх нього
- [x] 2.2 Параметр `json`; перевести виклики в `web/src/api/*` і `auth/`

### Порція 3 — середній ризик: AI-маршрути сервера (знахідка 1)

- [x] 3.1 Характеризаційні тести на те, чого ще не покрито: 404/400/409 і склад ZIP для `relevance`, `ai-picks`,
      `analyze/package.zip`, `search-synonyms`
- [x] 3.2 `guards.ts`, `errorMessage`, `routes/http.ts` (`parseIds`, `sendZip`), `numberedFile` у `analysis/manualZip.ts`, `requireMode` + тести
- [x] 3.3 Перевести `relevance.ts`, `aiPicks.ts`, `searchSynonyms.ts`
- [x] 3.4 Перевести `routes/analysis/matching.ts`, `criteria.ts`, `routes/categories.ts` (ключ AI)
- [x] 3.5 Тексти помилок → `ANALYSIS_ERRORS`; імена файлів ZIP → `analysis/manualZip.ts`

### Порція 4 — низький ризик: конфігурація (знахідка 4)

- [ ] 4.1 Фронтенд: числа → `web/src/constants.ts`
- [ ] 4.2 Сервер: числа → `src/constants.ts` (сервер)

### Завершення

- [ ] 5.1 `docs/structure.md`, `docs/architecture.md` — нові файли; короткий розділ «Як проєктувати модуль»
      (примітиви, де живе політика, чотири питання) у `docs/development.md`
- [ ] 5.2 Статус ✅, `git mv` у `docs/plans/old/`

## Test-cases

Автоматичні: `npm run check` і `npm run build` до і після кожної порції; нові тести порції 3 проходять і до, і після
переведення маршрутів.

Ручні (людина, після деплою або локально) — назви з екрана:

1. Відкрити пошук → кнопка **AI** → **AI Фільтр**: перемикач обсягу показує ті самі числа, що й раніше; за
   замовчуванням обрано «Весь пошук» (або «Вибрані», якщо є позначені рядки).
2. **AI** → **Плюси / Мінуси**: у смузі кроків майстра підпис обсягу той самий («Весь пошук (N)» / «У таблиці…»).
3. **AI** → **AI Вибір**: за замовчуванням обрано «Найкращі кандидати».
4. У будь-якому з трьох діалогів — ручний режим → **Завантажити ZIP**: файл завантажується, всередині `prompt.txt` і
   теки з чанками.
5. Майстер «Плюси / Мінуси» → крок перегляду → експорт **xlsx**: файл відкривається.
6. Відкрити неіснуючий пошук неможливо з UI — перевіряється тестами (404).

## Відкриті питання

- Скіл пропонує окремий файл MODULE-DESIGN у `docs/`; у плані — розділ у `docs/development.md` (одне джерело про процес).
- Порція 4.2: константа, яку читає один файл, після переносу лежить далі від коду. Якщо це не бажано — лишити
  серверну частину як є.
