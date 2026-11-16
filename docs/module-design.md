# Дизайн модулів

Каталог примітивів модулів, перероблених на «дещо універсальні». Принципи й чотири питання до нового
інтерфейсу — [`development.md`](development.md) → «Як проєктувати модуль». Історія рішень —
[`refactor-audit/audit.md`](refactor-audit/audit.md),
[`plans/old/refactor-general-modules.md`](plans/old/refactor-general-modules.md).

## Перероблені модулі

### Ручний порядок — `server/src/db/repos/manualOrder.ts`

| Примітив | Що робить |
|---|---|
| `ManualOrderList { table, groupColumn?, neighborFilter? }` | опис впорядкованого списку: таблиця з `sort_order`, група сусідів, фільтр сусідів |
| `nextTopSortOrder(list)` | `sort_order` для нового елемента згори |
| `moveOneStep(list, id, direction)` | обмін із сусідом; `false` — елемента немає |
| `isDirection(value)` | перевірка `'up' \| 'down'` |

**Де політика:** опис списку — у репозиторії сутності (`PROJECT_ORDER` у `repos/projects.ts`, `SEARCH_ORDER` у
`repos/searches.ts`); перевірка напряму, тексти помилок і що повернути після руху — у `services/`.
Новий впорядкований список = нова константа `ManualOrderList` поруч із його таблицею, без нових функцій.
