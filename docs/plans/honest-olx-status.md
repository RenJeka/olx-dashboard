# План: чесний статус активності оголошення (`olx_status`)

## Контекст

Колонка «Статус OLX» (`listings.olx_status`) вводила в оману: показувала `active` навіть
для знятих/проданих оголошень. Причина — `olx_status` це **застиглий знімок** з останнього
GraphQL-скану, що бачив оголошення у видачі. Коли оголошення зникає з видачі, скан його
більше не торкається → `olx_status` навічно лишається `active`. Реальну «смерть» фіксували
ІНШІ механізми (вікно покриття → `status='disabled'`; verify-прохід → проба `410`/`404`),
але вони **не оновлювали `olx_status`** → у таблиці конфлікт: «Статус OLX = active», а
робочий «Статус = disabled».

**Мета:** чесна колонка **без додаткового скрейпінгу**.

## Рішення

1. Death-детектори (coverage, verify) **перезаписують `olx_status`** інферованим значенням.
2. Поріг авто-disable у вікні покриття **пропорційний надійності скану**: глибокий → 1
   промах, звичайний → 2 (ідея: глибокий бачить усю видачу, тож 1 промах = достатній доказ;
   звичайний бачить лише верхівку ≤3 запити → буфер проти дрижання).
3. UI: зрозумілий бейдж активності + **свіжість** («Востаннє бачили: N дн тому» з `last_seen_at`).

> **Засто́рога (не регрес, наявне обмеження):** вікно покриття запускається лише для
> `usedGraphql && !partial`. Великі пошуки (>1000 результатів) у глибокому скані роблять
> price-split або впираються у вікно пагінації → `partial=true` → вікно покриття
> ПРОПУСКАЄТЬСЯ. Тобто `deep→1` діє лише для пошуків, які глибокий скан вичерпує цілком
> (≲1000, без split). Для більших death ловить лише verify.

## Синтетичні значення `olx_status`

| Значення | Джерело | Палітра бейджа |
| --- | --- | --- |
| `active` | GraphQL-скан живе / verify-реактивація | green «активне» |
| `inactive` | вікно покриття (`miss_count >= threshold`) | gray «неактивне» |
| `removed` | verify `410`/`404` | red «знято» |
| `<сире>` | миттєвий olx_status-disable (GraphQL статус ≠ active) | gray, as-is |
| `NULL` | зібрано лише HTML-fallback / до міграції | gray **outline** «невідоме» |

Окреме значення `'unknown'` у БД НЕ пишемо: verify-вердикт `unknown` лишає `olx_status` без
змін (щоб не затирати останнє відоме). «Невідоме» — це рендер `NULL`, не записуваний статус.

Self-healing: повернення у видачу живим → `normalizer.ts` `olx_status = COALESCE(excluded.olx_status, olx_status)`
перезапише назад на `active` + auto-reactivate.

## Кроки

- [x] `server/src/scraper/statusEngine.ts`: `applyScanStatuses(..., threshold = 2)`;
      `missCount >= threshold`; гілка disable через окремий `updateDisabledStmt`
      (`status='disabled'`, `olx_status='inactive'`); маркер `note` →
      `auto-disabled: coverage miss_count=<threshold>` (ідемпотентність за префіксом).
- [x] `server/src/scanner.ts`: виклик `applyScanStatuses(searchId, raw, exhausted, options?.deep ? 1 : 2)`.
- [x] `server/src/scanner.ts`: `updateDeadStmt` → додатково `olx_status='removed'`;
      `updateAliveStmt` → `olx_status = CASE WHEN @reactivate = 1 THEN 'active' ELSE olx_status END`;
      у виклику передавати `reactivate: reactivate ? 1 : 0`.
- [x] `web/src/components/table/columns.tsx`: мапінг `ACTIVITY_BADGE` (active/inactive/removed),
      тултіп зі свіжістю (`formatRelativeTime(last_seen_at)`), заголовок «Активність»,
      `TOGGLEABLE_COLUMNS` label «Активність». DTO вже містить `olx_status`/`last_seen_at`/`miss_count`.
- [x] Документація: `CLAUDE.md` (інваріанти coverage/verify), `docs/olx-api.md` §3.4
      (синтетичні значення), `docs/architecture.md` (потік olx_status), цей план.

## Доповнення: ручний override «Активності» (scope «Підказка»)

Дозволити вручну змінювати `olx_status` через інлайн-select у таблиці (UX як `StatusCell`).
**Без захисту** (рішення користувача): ручне значення — разова підказка; наступний
GraphQL-скан/verify, який побачить оголошення, перепише його реальним значенням від OLX
(self-healing через `COALESCE` у `normalizer.ts`). Для `NULL`-рядків поза видачею ручне
значення зберігається (скан їх не торкається). Окрема колонка-джерело НЕ додається.

Дозволені значення: `active` / `inactive` / `removed` / `NULL` («невідоме»).

- [x] `server/src/types.ts` + `web/src/types/index.ts`: `ListingPatch.olx_status?: string | null`.
- [x] `server/src/routes/listings.ts` (PATCH `/api/listings/:id`): приймати `olx_status`,
      валідувати (`null` або одне з `active|inactive|removed`), `UPDATE ... olx_status = ?`.
- [x] `web/src/components/table/ActivityCell.tsx`: select-бейдж (як `StatusCell`) з опціями
      невідоме/активне/неактивне/знято + тултіп свіжості; зміна → `useUpdateListing` PATCH
      `{ olx_status }`. Сире значення поза набором — показуємо окремою опцією as-is.
- [x] `web/src/components/table/columns.tsx`: колонка `olx_status` рендерить `<ActivityCell>`.

## Test-cases (перевіряє користувач)

1. **deep=1:** оголошення, якого вже немає у видачі, є в БД (`status_source=auto`,
   `last_refresh_at >= windowFloor`). Один **глибокий** скан (не partial) → `status=disabled`,
   `olx_status='inactive'`, `note` містить `coverage miss_count=1`.
2. **normal=2:** те саме, але **звичайними** сканами → disable лише після другого
   (після першого `miss_count=1`, статус без змін).
3. **verify-removed:** «Перевірити неактивні» на оголошенні зі сторінкою `410`/`404` →
   `status=disabled`, `olx_status='removed'`, `note` містить `verify http=410`.
4. **Self-heal:** оголошення з `olx_status='inactive'` знову у видачі живим → після скану
   `olx_status='active'`, `status` реактивовано (`disabled→new`).
5. **UI:** бейдж «активне/неактивне/знято» відповідає даним; тултіп показує «Востаннє
   бачили: N дн тому»; перемикач видимості колонки «Активність» працює.
6. **Великий пошук (partial):** глибокий скан пошуку >1000 (split/cap) → вікно покриття
   пропущено, хибних disable немає.
7. `npm run build` зелений (server + web). ✅
