# План: Проекти (групування пошуків в акордеони)

## Контекст

Бічна панель показувала плаский список пошуків (акордеони «Пошуки»/«Архів»). Коли пошуків багато,
їх ніяк не згрупувати. **Проекти** додають рівень організації: кожен пошук може належати до
проекту, проекти показуються окремими акордеонами (розкрити/згорнути), проект можна створити,
перейменувати, видалити, а пошуки переміщати між проектами через 3-dot меню.

Рішення:
- **Видалення проекту → відв'язати пошуки** (`project_id = NULL`, пошуки лишаються у групі «Без
  проекту»). Пошуки НЕ видаляються.
- **Призначення пошуку до проекту — через 3-dot меню** рядка пошуку (підменю «Перемістити в
  проект → [список проектів / Без проекту]»).

Фіча повторює патерн `archived`/`query_synonyms` (нова nullable-колонка + `addColumnIfMissing` +
CRUD-роут + TanStack-хуки + діалоги в стилі `SearchCreateDialog`).

## Файли

### Backend
- `server/src/db/schema.sql` — таблиця `projects` + колонка `searches.project_id`.
- `server/src/db/db.ts` — `addColumnIfMissing('searches', 'project_id', 'INTEGER REFERENCES projects(id)')`.
- `server/src/types.ts` — `interface Project`.
- `server/src/routes/projects.ts` (новий) — CRUD `/api/projects[/:id]` + `/move`.
- `server/src/routes/searches.ts` — PATCH приймає `project_id`; `/move` реордерить у межах того ж `project_id`.
- `server/src/index.ts` — реєстрація `projectsRoutes`.

### Frontend
- `web/src/types/index.ts` — `project_id` у `Search` + `interface Project`.
- `web/src/api/projects.ts` (новий) + ре-експорт у `web/src/api/index.ts`.
- `web/src/components/searches/Searches.tsx` — `useProjects()`, передача у панель.
- `web/src/components/searches/SearchesPanel.tsx` — акордеони проектів + «Без проекту»/«Архів» + кнопка «Новий проект».
- `web/src/components/searches/ProjectAccordionItem.tsx` (новий).
- `web/src/components/searches/ProjectCreateDialog.tsx`/`ProjectEditDialog.tsx`/`ProjectDeleteDialog.tsx` (нові).
- `web/src/components/searches/SearchRowMenu.tsx` — підменю «Перемістити в проект».
- `web/src/components/searches/SearchRow.tsx` — `useProjects`/`useAssignSearchToProject`, проброс у меню.

## Кроки

- [x] Файл плану.
- [x] Backend: схема `projects` + `searches.project_id` (schema.sql + db.ts).
- [x] Backend: тип `Project`.
- [x] Backend: роути `projects.ts` (GET/POST/PATCH/DELETE/move) + реєстрація.
- [x] Backend: PATCH `searches` приймає `project_id`; `/move` у межах проекту.
- [x] Frontend: типи (`Search.project_id`, `Project`).
- [x] Frontend: API-хуки `projects.ts`.
- [x] Frontend: `ProjectAccordionItem` + діалоги (create/edit/delete).
- [x] Frontend: `SearchesPanel` рендерить проекти + «Без проекту»/«Архів» + кнопка «Новий проект».
- [x] Frontend: `SearchRowMenu` підменю «Перемістити в проект» + проброс із `SearchRow`.
- [x] Документація: `architecture.md`, `structure.md`, цей файл.

## Test-cases

1. **Міграція**: на існуючій `server/data/olx.db` стартує без помилок; таблиця `projects`
   створена, колонка `searches.project_id` додана; наявні пошуки — у групі «Без проекту».
2. **Створення проекту**: «Новий проект» → назва → проект з'являється акордеоном (порожній).
3. **Призначення**: 3-dot пошуку → «Перемістити в проект → <проект>» → пошук переходить під
   акордеон проекту; бейдж-лічильник оновлюється; галочка біля поточного проекту.
4. **Перейменування**: меню проекту → «Перейменувати» → назва оновлюється.
5. **Реордер усередині проекту**: стрілки ↑/↓ на пошуку не «втікають» в іншу групу
   (`/move` фільтрує сусіда за `project_id`).
6. **Реордер проектів**: стрілки ↑/↓ у заголовку акордеону змінюють порядок проектів.
7. **Видалення проекту**: підтвердження → проект зникає, його пошуки у «Без проекту»
   (НЕ видалені, оголошення на місці) — `GET /api/searches` показує `project_id=null`.
8. `npm run build` — TypeScript strict проходить.
