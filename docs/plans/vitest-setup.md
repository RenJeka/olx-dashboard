# План: автотести (Vitest) для доменного ядра сервера

> **Статус:** 🟢 активний (з 2026-09-29) · перший набір готовий (41 тест); відкрите питання нижче.
> Примітка: файл плану створено після початку робіт (порушення конвенції «план першим»).

## Контекст

Автоматичних тестів у репозиторії не було. Найризиковіша логіка — auto-disable (інцидент
2026-06-12: 395 хибних disable), upsert/дедуп, локальні фільтри, парсинг відповідей LLM.
Vitest погоджено користувачем як нову dev-залежність `server/`.

## Рішення

- **Vitest** у `server/` (`npm test` у корені → `npm -w server run test`), входить у `npm run check`.
- БД-тести — на **тимчасовому файлі libSQL** (`vitest.config.ts` задає `TURSO_DATABASE_URL`;
  `env.ts` не перезаписує задані змінні) з тією самою схемою через `initDb()`; файли тестів —
  послідовно; `resetDb()` чистить таблиці в `beforeEach`; після прогону файл БД видаляється
  (`src/test/globalSetup.ts`). `server/data/olx.db` тести не чіпають.
- Тести — поруч із кодом (`*.test.ts`); хелпери — `server/src/test/`. Із production-збірки
  виключені (`tsconfig.build.json`), але проходять `typecheck`.
- Тести фіксують **поточну** поведінку (characterization). Знайдені розбіжності з документацією
  не «виправляються» тестом мовчки — виносяться на рішення людини (нижче).

## Файли

- `server/vitest.config.ts`, `server/tsconfig.build.json`, `server/src/test/{db,globalSetup}.ts`
- `server/src/scraper/{statusEngine,normalizer,localFilters}.test.ts`, `server/src/analysis/parse.test.ts`
- `package.json` (`test`, `check`), `server/package.json` (`test`, `test:watch`, `build`)
- `AGENTS.md`, `docs/development.md`, `docs/structure.md`

## Кроки

- [x] Vitest + конфіг з ізольованою тимчасовою БД + прибирання.
- [x] `statusEngine`: вікно покриття (пороги 1/2, floor — останній елемент, поза вікном,
      NULL-refresh, без осі, exhausted), manual/rejected, маркер у note.
- [x] `normalizer`: `parsePrice`, insert/дедуп, miss_count=0, `olx_status`-disable, manual,
      auto-reactivate, HTML-fallback не затирає GraphQL-поля, filtered_out, analysis_stale,
      `price_history` ще не пишеться (Етап 3).
- [x] `localFilters`: групи, invert, AND, null-значення.
- [x] AI-парсинг: evidence-перевірка, канонічні критерії, огорожі/`{results}`, mergeResults,
      `parseRelevanceResponse`, пре-фільтр (вікно 4 слова, запобіжник, синоніми).
- [x] Документація.
- [ ] Рішення по відкритому питанню → за потреби правка коду або документації + тесту.
- [ ] Далі (окремо): `scraper/graphql/mapper.ts` і `selectors.ts` на збережених фікстурах OLX.

## Відкриті питання

1. **NULL-refresh при вичерпаній видачі.** Документація (`AGENTS.md`, `business-rules.md` §3):
   рядки з `last_refresh_at IS NULL` — «не кандидати **ніколи**, їх перевіряє verify». Код
   (`statusEngine.ts`): при `exhausted=true` кандидати — усі відсутні у видачі, **включно** з
   NULL-refresh. Тест `вичерпана видача …` фіксує поточну поведінку з позначкою ⚠️.
   Варіанти: (а) це задумано — уточнити документацію («не кандидати, якщо видача не вичерпана»);
   (б) це баг — додати `AND last_refresh_at IS NOT NULL` і для exhausted.

## Test-cases

- `npm test` — 41/41 зелені; `npm run check` зелений.
- Після прогону в `%TEMP%` не лишається `olx-dashboard-test-*`.
- `npm -w server run build` — у `dist/` немає `*.test.*`.
