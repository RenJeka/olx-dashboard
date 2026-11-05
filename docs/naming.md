# Найменування

Однакове поняття має всюди одну назву, різні поняття — різні назви. Новий код пишемо за цими правилами;
історія рішень — [`naming-audit/audit.md`](naming-audit/audit.md).

## Регістр і форма

| Що | Правило | Приклад |
|---|---|---|
| Змінні, функції, параметри | camelCase (навіть коли значення йде в snake_case-поле DTO: `{ local_filters: localFilters }`) | `searchId`, `listLightRows` |
| Константи модуля | UPPER_SNAKE | `PICK_CANDIDATES_LIMIT` |
| Типи, інтерфейси, класи, React-компоненти | PascalCase | `SearchRecord`, `AiPickCard` |
| Поля DTO між беком і фронтом | snake_case = назва колонки БД | `last_seen_at` |
| Модулі `.ts` | camelCase | `scanFinalize.ts` |
| Файли компонентів `.tsx` | PascalCase, як компонент | `AiPicksDialog.tsx` |
| Папки | одне слово — lowercase; кілька — kebab-case | `ai-picks/` |
| Скрипти `scripts/`, файли документації | kebab-case | `check-doc-links.mjs` |
| Таблиці й колонки БД | snake_case; таблиці — множина; час — `*_at` | `scan_runs.finished_at` |
| Змінні оточення | UPPER_SNAKE з префіксом сервісу | `TURSO_AUTH_TOKEN` |

Виняток — згенеровані сніпети Chakra у `web/src/components/ui/` (kebab-case файли).

## Дієслова

| Шар | Дієслово | Значення |
|---|---|---|
| `db/repos/` | `get*` | один рядок або `undefined` |
| `db/repos/` | `list*` | масив рядків |
| `db/repos/` | `*Exists` | boolean |
| `db/repos/` | `insert*` / `update*` / `upsert*` / `delete*` / `set*` | запис |
| `web/src/api/` | `use*` — хук TanStack Query; `fetch*` — разовий запит поза хуком | `useProjects`, `fetchSynonymsPrompt` |

Назва сервісу може відрізнятися від репо-функції, яку він обгортає (`getLogs` → `listLogs`), але дві різні
функції не мають однакової назви в різних шарах.

## Словник понять

| Поняття | Канонічна назва | Не вживати |
|---|---|---|
| Останній запис за часом | `last` | `latest` |
| AI Вибір | `aiPicks` / `AiPick*` (колонки БД `ai_rank*` — історичні) | `AiRank*` |
| Очищення журналу | `clear` | `deleteAll` |
| Групування пошуків | `project`, укр. «проєкт» | «проект» |

## Підписи UI

- Кнопки — дієслово доконаного виду в наказовому способі: «Зберегти», «Скасувати», «Скопіювати», «Видалити».
- Відмова в діалозі — завжди «Скасувати»; повернення на крок майстра — «Назад».
