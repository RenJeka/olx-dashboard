# Аудит найменування — 2026-11-05

Знімок стану за скілом `naming-consistency-audit`. План виправлень — [`plans/old/naming-consistency.md`](../plans/old/naming-consistency.md).

Обсяг: `server/src`, `web/src`, `scripts`, `server/src/db/schema.sql`, підписи UI. Виключено: `node_modules`,
згенеровані обгортки скілів, `docs/plans/old/`, хендофи, lock-файли.

## Домовленості

| Категорія | Правило | Приклад |
|---|---|---|
| Змінні, функції, параметри | camelCase | `listLightRows`, `searchId` |
| Константи модуля | UPPER_SNAKE | `PICK_CANDIDATES_LIMIT` |
| Типи, інтерфейси, класи, React-компоненти | PascalCase | `SearchRecord`, `AiPicksDialog` |
| Поля DTO між беком і фронтом | snake_case = назва колонки БД | `last_seen_at`, `stale_count` |
| Модулі `.ts` | camelCase | `scanFinalize.ts` |
| Файли компонентів `.tsx` | PascalCase за назвою компонента | `AiPicksResultStep.tsx` |
| Папки | одне слово — lowercase; кілька — kebab-case | `ai-picks/`, `action-panel/` |
| Скрипти `scripts/` | kebab-case | `check-doc-links.mjs` |
| Таблиці й колонки БД | snake_case, таблиці у множині; час — `*_at` | `scan_runs.finished_at` |
| Змінні оточення | UPPER_SNAKE з префіксом сервісу | `TURSO_AUTH_TOKEN` |
| Репозиторії БД (`db/repos/`) | `get*` — один рядок, `list*` — багато, `*Exists` — boolean, `insert/update/delete/upsert*` — запис | `getProject`, `listProjects` |
| Кнопки UI | дієслово доконаного виду в наказовому способі | «Зберегти», «Скасувати», «Скопіювати» |

## Словник понять

| Поняття | Канонічна назва | Синоніми, що замінюємо |
|---|---|---|
| Останній запис (за часом) | `last` | `latest` |
| Вибірка багатьох рядків у репозиторії | `list*` | `load*` |
| AI Вибір (картка обраного оголошення) | `AiPick*` | `AiRank*` |
| Кнопка відмови в діалозі | «Скасувати» | «Відмінити» |
| Кнопка копіювання | «Скопіювати» | «Копіювати» |

## Відхилення

| Категорія | Назва зараз | Має бути | Згадок | Де |
|---|---|---|---|---|
| Код | `description_preview` (локальна змінна) | `descriptionPreview` | 2 | `server/src/services/listings.ts` |
| Код | `local_filters` (локальна змінна) | `localFilters` | 2 файли | `web/src/utils/localFilters.ts`, `web/src/components/searches/SearchFiltersDrawer.tsx` |
| Код | `stale_count`, `verify_candidates` (локальні змінні) | `staleCount`, `verifyCandidates` | 1 файл | `web/src/utils/searchStats.ts` |
| Код | `getSearch` у `db/repos/analysis.ts` — та сама назва, що й `getSearch` у `services/searches.ts`, але інше поняття (зріз полів для аналізу без 404 проти повного запису з 404) | `getSearchAnalysisRow` | 33 | `routes/aiPicks.ts`, `routes/relevance.ts`, `routes/analysis/*`, `cli/llmEval.ts` |
| Код | `loadListings` (репо, багато рядків) | `listAnalysisListings` | 16 | `db/repos/analysis.ts` + маршрути AI |
| Код | `loadPickCandidates` (репо, багато рядків) | `listPickCandidates` | 6 | `db/repos/analysis.ts`, `routes/aiPicks.ts` + доки |
| Код | `getLatestScanStatus` | `getLastScanStatus` | 3 | `db/repos/scanRuns.ts`, `services/searches.ts` |
| Код | `getLatestAnalysis` | `getLastAnalysisRun` | 3 | там само (ім'я `getLastAnalysis` уже зайняте сервісом) |
| Файли | `AiRankCard.tsx` / `AiRankCard` | `AiPickCard.tsx` / `AiPickCard` | 4 | `web/src/components/analysis/` + `docs/structure.md` |
| UI | «Відмінити» | «Скасувати» | 2 | `wizard/CommitStep.tsx`, `searches/SearchVariantsDialog.tsx` |
| UI | «Копіювати» | «Скопіювати» | 1 | `analysis/ManualAssistant.tsx` |

## Не змінюємо (і чому)

- **Колонки БД** (`ai_rank`, `ai_pick_reason`, `ai_ranked_at`, лічильники `found` / `new_count` / `miss_count`,
  `app_logs.ts`) — дані в Turso; автоміграція вміє лише `ADD COLUMN`, перейменування потребує ручного rebuild.
- **snake_case у DTO** — збігається з колонками БД і з контрактом API; це правило, а не відхилення.
- **`web/src/components/ui/close-button.tsx`, `color-mode.tsx`** — згенеровані сніпети Chakra.
- **`server/src/analysis/*.py`** — Python, snake_case за нормою мови.
- **URL API** (`/api/...`) — на них спирається фронт і smoke-перевірка.
- **Пари сервіс ↔ репо з різними назвами** (`getLogs` → `listLogs`, `getSearch` → `getSearchRecord`) — свідомий
  поділ шарів.
- **`cnt` / `n` / `val` як SQL-аліаси** — локальні для одного запиту.

## Відкриті питання

Вирішено людиною 2026-11-05:

1. «проект» → «проєкт» (чинний правопис) — в UI, коментарях і живих документах.
2. Очищення журналу — дієслово `clear`: сервіс `deleteAllLogs` → `clearLogs`, репо `clearLogs` → `clearLogRows`.
