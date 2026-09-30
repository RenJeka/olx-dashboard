# Процес розробки й перевірка — OLX Dashboard

> Як брати задачу в роботу, чим перевіряти зміни і коли задача вважається готовою.
> Інваріанти й конвенції — [`../AGENTS.md`](../AGENTS.md); доменні правила —
> [`business-rules.md`](./business-rules.md); архітектура — [`architecture.md`](./architecture.md).

## 1. Цикл задачі

1. **Контекст.** Прочитати `AGENTS.md` і документ із карти, що стосується задачі
   (скани/статуси → `business-rules.md`, OLX → `olx-api.md`, AI → `ai-flow.md`).
2. **План першим кроком.** `docs/plans/<назва>.md`: контекст → файли → кроки з чекбоксами →
   test-cases; під заголовком `> **Статус:** 🟢 активний`. Зміна стеку, схеми чи інваріантів —
   лише після підтвердження людиною.
3. **Код.** Малими кроками, відмічаючи чекбокси плану.
4. **Документація.** За правилами з `AGENTS.md` → «Конвенції» (architecture/structure,
   business-rules, olx-api + журнал §6).
5. **Перевірка** — драбина з §2.
6. **Завершення.** Статус плану ✅ (з приміткою про непрогнані ручні test-cases) →
   `git mv` у `docs/plans/old/` → текст коміту англійською.

## 2. Драбина перевірок

Перевірка — від дешевого до дорогого:

| # | Що | Команда / як | Коли |
|---|---|---|---|
| 1 | Типи (strict) | `npm run typecheck` (server `tsc --noEmit` + web `tsc -b --noEmit`) | завжди |
| 1a | Автотести (Vitest, server) | `npm test` (`npm -w server run test:watch` — у режимі спостереження) | завжди; зміна доменної логіки — разом із тестом |
| 2 | Посилання в документації | `npm run docs:check` | завжди (0 битих) |
| 1–2 | Разом (typecheck + test + docs + skills) | `npm run check` | перед комітом |
| CI | `npm ci` → `npm run check` → `npm run build` на Node з `.nvmrc` | GitHub Actions, `.github/workflows/ci.yml` | автоматично на кожен push; червоний — не зливати |
| 3 | Збірка | `npm run build` | зміни в конфігах TS/Vite, залежностях, `server/scripts/` |
| 4 | Smoke API | `npm run dev` + запити нижче | зміни на сервері |
| 5 | UI / E2E | сабагент `playwright-tester` із конкретними test-cases з плану | зміни в UI — **лише за явним запитом людини** |
| 6 | Живий OLX | скан на тестовому пошуку (UI або `npm run scan -- --search <id>`) | зміни в зборі/статусах; див. §3 |

**Smoke API** (з `AUTH_DISABLED=true` у `server/.env`), очікується `200`:

```bash
curl -s -o /dev/null -w "%{http_code}\n" localhost:3001/health
curl -s -o /dev/null -w "%{http_code}\n" localhost:3001/api/auth/me
curl -s -o /dev/null -w "%{http_code}\n" localhost:3001/api/searches
curl -s -o /dev/null -w "%{http_code}\n" localhost:3001/api/searches/<id>/listings
curl -s -o /dev/null -w "%{http_code}\n" localhost:3001/api/logs
```

`500` з `no such column` — схема БД відстала від `schema.sql` (див. §4). Помилки також видно в
діалозі «Журнал» (`GET /api/logs`) і в stdout сервера (pino).

## 3. Робота з живим OLX

- Кожен скан — реальні запити до OLX. Не ганяти скани в циклі для налагодження: для логіки
  нормалізації/статусів достатньо одного скану, далі — дані з БД.
- Глибокий скан — десятки-сотні запитів і хвилини часу; запускати лише коли зміна стосується
  саме його. Для оцінки обсягу — «Аналіз перед сканом» (лише probe-запити).
- Ліміти ввічливості (`AGENTS.md`) не послаблювати заради швидшої перевірки.
- Якщо OLX відповідає не так, як очікувалось, — чекліст `olx-api.md` §5, без переходу на Playwright.

## 4. Робота з БД

- **Бекап перед ризикованими змінами** (міграції, масові UPDATE, експерименти зі статусами):
  скопіювати `server/data/olx.db` **разом з `olx.db-wal`** у файл з розширенням `.db` /
  `.db-wal` (напр. `olx.bak-<дата>.db`), щоб він підпадав під `.gitignore`.
- **Міграції схеми.** Нову колонку достатньо додати в `schema.sql`: `initDb()` на старті сам
  виконає `ALTER TABLE … ADD COLUMN` у наявних БД (локальній і Turso) і залогує кожну міграцію
  (`Міграція схеми: …`). Нову колонку робити nullable або з константним `DEFAULT`. Якщо потрібні
  `PRIMARY KEY`/`UNIQUE`/`NOT NULL` без дефолту/`DEFAULT (вираз)`, зміна чи видалення колонки —
  автоміграція відмовить (старт падає з назвою колонки): потрібен ручний rebuild таблиці з
  бекапом. Перевірити на копії: `TURSO_DATABASE_URL=file:<копія>.db npm run scan -- --search <id>`
  або старт сервера з цим env.
- **Turso.** Кожен рядок читання/запису — квота. Нові запити батчити; нові індекси — лише на
  колонках, які не переписуються кожним сканом; заміри — скіл `turso-reads-playbook`.
- Секрети й реальні токени — лише в `.env`, у бекапах/логах не комітити.

## 5. Definition of Done

- [ ] План у `docs/plans/` зі статусом і відміченими кроками.
- [ ] `npm run check` — 0 помилок типів, 0 битих посилань.
- [ ] Для серверних змін — smoke API; для UI — test-cases прогнані (агентом за запитом або людиною).
- [ ] Інваріанти `AGENTS.md` не порушено; якщо змінено за погодженням — оновлено `AGENTS.md` і `business-rules.md`.
- [ ] Документація оновлена (architecture/structure/olx-api — за типом зміни).
- [ ] Непрогнані ручні test-cases названо в статусі плану, а не відмічено наосліп.
- [ ] Запропоновано текст коміту англійською.

## 6. Скіли: зміни й перевірка

Скіли редагуються лише в `skills/` (див. [`skills/README.md`](../skills/README.md)); після змін —
`npm run skills:sync`. Обгортки перевіряються автоматично (`skills:check`, `docs:check`).

**Claude Code** (автоматично, headless):

```bash
claude -p "Invoke the project skill refactor-plan via the Skill tool. Do NOT change code. Reply: CANONICAL_PATH=<file with full instructions>; FIRST_HEADING=<its first heading>" --allowedTools "Skill Read Glob" --max-turns 8
# очікується: CANONICAL_PATH=skills/refactor-plan/SKILL.md; FIRST_HEADING=# Refactor Plan
```

**Antigravity** (вручну, у чаті агента в цьому репозиторії):
> Use the refactor-plan skill. Do not change any code. Tell me the path of the file with its full
> instructions and quote the first heading of that file.

Очікується: скіл знайдено, шлях `skills/refactor-plan/SKILL.md`, заголовок `# Refactor Plan`.
Якщо Antigravity скіла не бачить — перевірити, з якої теки він читає скіли (очікується
`.agents/skills/`), і за потреби додати ціль у `scripts/sync-skills.mjs` (`TARGET_DIRS`).

## 7. Автотести

**Vitest** у `server/` (`npm test`). Тести — поруч із кодом (`*.test.ts`), хелпери — `server/src/test/`
(`resetDb`, `createSearch`, `insertListing`, `gqlListing`). БД-тести йдуть на тимчасовому файлі
libSQL з тією самою схемою (`initDb()`), послідовно, з очищенням у `beforeEach`; реальна
`server/data/olx.db` не чіпається. З production-збірки тести виключені (`tsconfig.build.json`).

Покрито: `statusEngine` (вікно покриття), `normalizer` (upsert, статуси, фільтри, `analysis_stale`),
`localFilters`, AI-парсинг і пре-фільтр релевантності. Тести фіксують поточну поведінку:
розбіжність із документацією — питання до людини, а не мовчазна правка тесту
(приклад — `docs/plans/vitest-setup.md` → «Відкриті питання»).

Далі за пріоритетом: `scraper/graphql/mapper.ts` і `selectors.ts` на збережених фікстурах
відповідей OLX (без живих запитів); маршрути API (Fastify `inject`); фронтенд (Vitest + jsdom) —
окремим рішенням.
