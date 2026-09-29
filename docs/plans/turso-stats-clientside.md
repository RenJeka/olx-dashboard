# План: клієнтське обчислення статистики пошуку (зрізати 408-рядковий прохід `/stats`)

## Контекст / мотивація

Замір Turso reads (2026-06-27, playbook `.claude/skills/turso-reads-playbook`) показав: вибір
пошуку коштує **1228 reads** = `listings` 816 + `stats` 410 + `relevance/target` 2.

`GET /api/searches/:id/stats` робить **окремий повний прохід `SUM(CASE…)` по всіх рядках пошуку**
(~408 reads на 408 оголошень), щоб порахувати 3 числа: `in_db`, `stale_count`, `verify_candidates`.
Усі три **виводяться з масиву `listings`, який фронт уже завантажив** на той самий вибір пошуку
(кеш React Query `['listings', searchId]`). Потрібні предикати спираються лише на колонки, наявні
в `LISTING_COLUMNS`/типі `Listing`: `url`, `last_seen_at`, `status_source`, `status`, `description`.

Лише `last_scan` (останній рядок `scan_runs`, 1 рядок) справді потребує БД.

**Мета:** прибрати агрегатний прохід — рахувати `in_db`/`stale_count`/`verify_candidates` на клієнті
з кешу listings; `/stats` залишає тільки дешевий `last_scan` (~1 read).
**Очікуваний виграш:** `/stats` 410 → ~1; вибір пошуку 1228 → **~819 reads (−33%)**, на кожному виборі.
**Масштабованість:** не залежить від кількості пошуків (на відміну від варіанта з `ANALYZE`/`SCAN`).

## Предикати (єдине джерело істини — `server/src/scanner/verifyScan.ts` + `routes/searches.ts:484`)

- `in_db` = `COUNT(*)` рядків пошуку = `listings.length` (бо `/listings` повертає всі рядки
  `WHERE search_id=?` без фільтра/пагінації → той самий набір, що рахує сервер).
- `stale_count` = `status_source='auto' AND last_seen_at < datetime('now','-3 days')`.
- `verify_candidates` = P1 + P2 (взаємовиключні):
  - **P1**: `url IS NOT NULL AND last_seen_at < now-3d AND (status_source='auto' OR status='rejected')`.
  - **P2**: `url IS NOT NULL AND description IS NULL AND status != 'disabled' AND NOT P1`.
- **UTC-нюанс:** `last_seen_at` зберігається як `datetime('now')` (UTC, формат `YYYY-MM-DD HH:MM:SS`).
  На клієнті парсити як UTC (додати `Z`/`T`) і порівнювати з `Date.now() - 3*86400*1000`.
- **NULL-нюанс:** `last_seen_at IS NULL` → у SQL `NULL < x` = NULL = false (не рахується). У JS
  трактувати null як «не stale».

## Файли

Сервер:
- `server/src/routes/searches.ts` (≈470-505) — прибрати `SUM(CASE…)`-агрегат; повертати лише `last_scan`.
- `server/src/types/scan.ts` — звузити DTO відповіді `/stats` (новий `LastScanResponse` = `{ last_scan }`);
  серверний `SearchStats` більше не потрібен у відповіді (перевірити інших споживачів).

Фронт:
- `web/src/utils/searchStats.ts` — **новий** util `computeListingStats(listings): { in_db, stale_count, verify_candidates }`
  (один прохід, реплікація предикатів з UTC/NULL-логікою).
- `web/src/api/searches.ts` — `useSearchStats`: тягне `last_scan` з `/stats` (звужений) + зливає з
  `computeListingStats(useListings(searchId).data)`; повертає той самий тип `SearchStats`, щоб
  споживачі не мінялись.
- `web/src/types/scan.ts` — додати тип `LastScanResponse`; `SearchStats` лишити (тепер збирається на клієнті).

Споживачі (НЕ міняти логіку, лише перевірити сумісність типів):
- `web/src/hooks/useSearchActionPanel.ts` (`stats.last_scan`, `stats.verify_candidates`).
- `web/src/components/searches/action-panel/ActionPanelStats.tsx` (`in_db`, `stale_count`).
- `web/src/components/searches/action-panel/ScanWarningSummary.tsx`, `utils/scanWarning.ts` (`last_scan`).

Документація:
- `docs/architecture.md`, `docs/structure.md` — відмітити новий util і змінену семантику `/stats`.
- `.claude/skills/turso-reads-playbook/SKILL.md` — оновити базлайн після заміру.

## Кроки

- [x] **С1.** Сервер: у `/api/searches/:id/stats` видалено `aggRow`-запит (`SUM(CASE…)`); лишився
      `lastScan`-запит; повертає `{ last_scan }` (тип `LastScanResponse`). Прибрано зайвий імпорт
      `P1_CONDITION/P2_CONDITION`.
- [x] **С2.** Серверний `SearchStats` використовувався лише в роуті `/stats` (grep) — замінено на
      `LastScanResponse`, інших споживачів немає.
- [x] **Ф1.** Створено `web/src/utils/searchStats.ts` з `computeListingStats` (єдиний прохід, UTC/NULL).
- [x] **Ф2.** Перероблено `useSearchStats`: `last_scan` зі звуженого `/stats` + `computeListingStats`
      з кешу listings (`useListings` дедуплікується з таблицею); повертає `SearchStats` (старий контракт).
- [x] **Ф3.** Додано типи (`LastScanResponse`); типчек сервера й web — чисто.
- [x] **Д1.** Оновлено `docs/structure.md` (новий util + семантика `/stats`). `architecture.md` `/stats`
      не згадує — без змін. SKILL-базлайн — після заміру V (нижче).
- [ ] **V (після деплою).** Замір через playbook: вибір пошуку має впасти 1228 → ~819; `/stats` ≈ 1 read;
      числа «У базі»/«Зниклі»/verify-кандидати в UI збігаються з попередніми серверними. Локальні зміни
      ще НЕ задеплоєні на Render — міряти після деплою цієї гілки.

## Test-cases (ручна перевірка користувачем — UI + playbook)

1. **Числа збігаються.** Вибрати пошук → картки «У базі» та «Зниклі/Старі» показують ті самі
   значення, що до зміни (звірити з минулим скрівном/значенням). Кнопка «Перевірити неактивні»
   показує той самий лічильник кандидатів.
2. **Reads впали.** Playbook delta-цикл на вибір пошуку: ~819 замість 1228; ізольований `/stats`
   ≈ 1 read замість 410.
3. **last_scan цілий.** Банер останнього скану / попередження (`ScanWarningSummary`) показуються як
   раніше (kind/found/new/warning).
4. **Порожній/новий пошук.** Пошук без оголошень: `in_db=0`, `stale_count=0`, verify=0, без помилок
   (listings = `[]`).
5. **Stale-межа.** Оголошення з `last_seen_at` рівно ~3 дні тому трактується так само, як на сервері
   (UTC-порівняння) — не off-by-timezone.
6. **Оптимістичний апдейт.** Зміна статусу рядка на `disabled`/`rejected` миттєво коригує
   verify-кандидатів (бо рахується з того ж кешу listings, який оновлює `useUpdateListing`).
