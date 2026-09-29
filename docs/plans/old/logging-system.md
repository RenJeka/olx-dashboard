# Система логування помилок: pino + журнал у БД + перегляд в UI

> **Статус:** ✅ виконано (2026-07-15).

## Контекст

Логування зараз фрагментарне: Fastify із `logger: true` (вбудований pino → JSON у stdout,
зникає після рестарту), доменний журнал лише для сканів (`scan_runs.error`/`warning`, без
етапу, на якому впало), 2 `console.error` повз логер, ~28 «тихих» best-effort `catch`
(правильна семантика, але повна невидимість — якщо best-effort падає постійно, ніхто не
дізнається). Немає: персистентності, зручного перегляду, поля «де в data flow сталося»,
єдиного сервісу.

## Рішення (варіант A, підтверджено користувачем)

- **Ядро — pino**, який уже всередині Fastify (0 нових runtime-механік): додаємо `pino` як
  пряму залежність `server/` (та сама версія з дерева fastify) + `pino-pretty` (devDep,
  читабельна консоль у dev; вмикається лише якщо пакет резолвиться — прод без devDeps не
  падає).
- **Єдиний сервіс `server/src/logger.ts`**: кореневий pino (передається у Fastify через
  `loggerInstance` — HTTP-логи і наші йдуть в один потік), `getLogger(scope)` (child),
  хелпери `logError(scope, stage, err, details?)` / `logWarn(scope, stage, message,
  details?)`. **`scope`** = модуль (`scanner`, `graphql-client`, `analysis`, `verify`,
  `http`, `process`), **`stage`** = крок data flow (`bisect ₴0–5000`,
  `bucket ₴100–200 стор. 3`, `variant «біговел» 2/4`, `persister-flush`,
  `openrouter attempt=2/2`, `GET /api/...`).
- **Персистентність — таблиця `app_logs`** (та сама libSQL/Turso): `ts, level, scope,
  stage, message, details(JSON: stack, searchId, runId…)`. У БД пишуться **лише
  warn+error** (info/debug — тільки stdout: не роздуваємо Turso rows written), запис
  fire-and-forget; збій запису журналу НЕ рекурсує (лог лише в stdout) і не валить логіку.
  Retention: на старті сервера видаляються записи, старші за `LOG_RETENTION_DAYS` (14).
- **Перегляд:** `GET /api/logs` (фільтри level/scope, limit) + `DELETE /api/logs`
  (очистити) + діалог «Журнал» у хедері фронта (іконка): таблиця час/рівень/scope/етап/
  повідомлення, клік по рядку розгортає details/stack, фільтри, оновлення, очищення.
- **Глобальні перехоплювачі:** `app.setErrorHandler` (усі невпіймані помилки роутів → журнал
  з методом/URL), `unhandledRejection`/`uncaughtException` (uncaught → лог і вихід).
- `scan_runs.error`/`warning` НЕ чіпаємо — це доменний підсумок; `app_logs` — технічний
  журнал (лінкуються через `runId`/`searchId` у details).

## Файли

- `server/src/logger.ts` — **новий**: root pino, getLogger, logError/logWarn, persist у
  app_logs, cleanupOldLogs.
- `server/src/db/schema.sql` — таблиця `app_logs` + індекс по ts.
- `server/src/routes/logs.ts` — **новий**: GET/DELETE `/api/logs`.
- `server/src/index.ts` — loggerInstance, setErrorHandler, process-хендлери,
  cleanupOldLogs, реєстрація logsRoutes.
- `server/package.json` — `pino` (dep), `pino-pretty` (devDep).
- Інструментація (проставити scope/stage): `scanner/scanPersister.ts` (замість
  console.error), `scanner/scanRunLifecycle.ts` (центральна точка збою скану),
  `scanner/fetchOrchestrator.ts` + `scanner/analyzeScan.ts` (порятунок варіанта),
  `scanner/scanFinalize.ts` (best-effort facet), `scraper/graphql/client.ts` (транзієнтні
  ретраї — ранній сигнал «OLX відбиває»), `scraper/graphql/split.ts` (бісекція/бакет),
  `scraper/graphql/fetcher.ts` (transient-fail сторінки deep), `scraper/verifier.ts`
  (probe unknown), `analysis/openrouter.ts` (невдалі спроби).
- Web: `web/src/types/core.ts` (+`AppLogEntry`), `web/src/api/logs.ts` (**новий**),
  `web/src/components/LogsDialog.tsx` (**новий**), `web/src/components/Header.tsx` (кнопка).
- Документація: `docs/architecture.md`, `docs/structure.md`, `AGENTS.md` (стек: pino).

## Кроки

- [x] План (цей файл).
- [x] Схема: таблиця `app_logs`.
- [x] `logger.ts` (root pino + pretty-у-dev + persist + retention) і залежності.
- [x] `index.ts`: loggerInstance, setErrorHandler, process-хендлери, retention, роут.
- [x] `routes/logs.ts`: GET (фільтри) + DELETE.
- [x] Інструментація точок скану/скрейпера/аналізу (scope/stage).
- [x] Web: тип + api-хук + LogsDialog + кнопка в Header.
- [x] Оновити docs/architecture.md, docs/structure.md, AGENTS.md.
- [x] `tsc` server + web build — зелені; смоук logger/retention на файловій БД.

## Test-cases (ручні)

1. **Помилка роуту** (напр. неіснуючий searchId → throw): відповідь 500 `{error}`, у
   «Журналі» запис `scope=http`, `stage=POST /api/...`, зі stack у details.
2. **Збій скану**: у журналі запис `scope=scanner` зі stage (`variant …`/`bisect …`) і
   `searchId`/`runId` у details; `scan_runs.error` як і раніше.
3. **Транзієнтний ретрай GraphQL**: смикнути мережу посеред deep-скану → warn-записи
   `graphql-client · retry offset=…` навіть якщо скан зрештою успішний.
4. **Дialog «Журнал»**: відкривається з хедера, фільтр «Помилки»/«Попередження», клік
   розгортає stack, «Очистити» спорожняє таблицю.
5. **Retention**: запис із ts старшим за 14 днів зникає після рестарту сервера.
6. **Прод без pino-pretty**: `NODE_ENV=production node dist/index.js` стартує без
   pino-pretty (JSON-логи), не падає.
