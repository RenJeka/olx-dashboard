# Аудит універсальності модулів — 2026-11-09

Знімок за скілом `somewhat-general-purpose-refactor`. План — [`plans/manual-order-refactor.md`](../plans/manual-order-refactor.md).

## Обсяг і домовленості

Людина попросила вибрати один модуль. Вибрано **ручний порядок** (стрілки ↑/↓ у списках і «нове — згори»)
у `server/src/db/repos/projects.ts`, `server/src/db/repos/searches.ts` і їхніх викликачах у
`server/src/services/projects.ts`, `server/src/services/searches.ts`. Причина вибору — найчистіший випадок
функцій-близнюків у нижньому шарі; поведінку вже фіксують тести маршрутів `/move`.

Домовленості: шари `routes → services → db/repos` (SQL лише в `db/repos/`, `npm run layers:check`), назви —
[`naming.md`](../naming.md), перевірка — `npm run check` + `npm run build`.

## Карта модулів

| Модуль | Шар | Точки входу ручного порядку | Викликачі |
|---|---|---|---|
| `db/repos/projects.ts` | нижній | `minProjectSortOrder`, `getProjectPosition`, `findProjectNeighbor`, `swapProjectSortOrder` | лише `services/projects.ts` (`createProject`, `moveProject`) |
| `db/repos/searches.ts` | нижній | `minSearchSortOrder`, `getSearchPosition`, `findSearchNeighbor`, `swapSearchSortOrder`, тип `SearchPosition` | лише `services/searches.ts` (`createSearch`, `moveSearch`) |
| `services/projects.ts`, `services/searches.ts` | верхній | `createProject`/`createSearch`, `moveProject`/`moveSearch` | `routes/projects.ts`, `routes/searches.ts` |

## Знахідки

### 1. Ручний порядок — функції-близнюки в двох репозиторіях

- **Зараз:** чотири пари функцій з однаковою логікою; різниця — назва таблиці та умова «хто вважається сусідом»
  (для пошуків — той самий проєкт, NULL-безпечно, і лише неархівні). `moveProject` і `moveSearch` у сервісах
  повторюють той самий алгоритм із чотирьох кроків (перевірити напрям → прочитати позицію → знайти сусіда →
  обміняти).
- **Чому це проблема:** механізм «пересунути на крок у впорядкованому списку» розмазаний по двох файлах і двох
  сервісах. Третій впорядкований список (наприклад, критерії чи колонки) додав би ще чотири функції в нижній шар.
  Виправлення в механізмі (скажімо, `NULL` у `sort_order`) треба робити двічі.
- **Пропоную:** новий модуль `db/repos/manualOrder.ts` — механізм без знання про проєкти й пошуки:
  - `nextTopSortOrder(list)` — `sort_order` для нового елемента згори списку;
  - `moveOneStep(list, id, direction)` — обміняти з сусідом; `false`, якщо елемента немає;
  - `isDirection(value)` — перевірка `'up' | 'down'`;
  - опис списку `ManualOrderList { table; groupColumn?; neighborFilter? }`.

  Політика лишається в репозиторіях сутностей: `PROJECT_ORDER = { table: 'projects' }`,
  `SEARCH_ORDER = { table: 'searches', groupColumn: 'project_id', neighborFilter: 'archived = 0' }`. Сервіс
  складає дію сам: `if (!(await moveOneStep(SEARCH_ORDER, id, direction))) throw new NotFoundError(...)`.
- **Чотири питання:**
  1. Найпростіший інтерфейс: дві функції + один тип опису списку замість восьми функцій.
  2. Ситуацій використання: два списки зараз; механізм не знає, який саме.
  3. Користуватися легко: виклик у сервісі коротший за нинішні три виклики.
  4. Загальне відокремлено: таблиця, група й фільтр — у константах сутностей, механізм їх лише застосовує.

## Не змінюємо (і чому)

- **Маршрути `POST /api/projects/:id/move`, `/api/searches/:id/move` і текст помилки напряму** — публічний для фронту
  контракт; лишаються як є.
- **Глобальний мінімум `sort_order` для нового пошуку** (по всіх пошуках, не в межах проєкту) — це поточна поведінка;
  рефакторинг її не змінює.
- **Інші функції репозиторіїв** (`insert*`, `delete*`, CRUD) — поза обраним модулем.

## Відкриті питання

Немає: людина попросила виконати без зупинки.
