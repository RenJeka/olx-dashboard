import { db } from '../db/db.js';
import type { RawListing } from '../types.js';

interface CandidateRow {
  id: number;
  miss_count: number;
  status: string;
  status_source: string;
  note: string | null;
}

const COVERAGE_NOTE_PREFIX = 'auto-disabled: coverage miss_count=';

const updateCandidateStmt = db.prepare(
  'UPDATE listings SET miss_count = ?, status = ?, note = ? WHERE id = ?',
);
// Гілка disable додатково перезаписує olx_status='inactive' — щоб колонка «Активність» у
// таблиці була чесною (інакше лишалося б застигле 'active' від останнього скану, що бачив
// оголошення). docs/plans/honest-olx-status.md.
const updateDisabledStmt = db.prepare(
  `UPDATE listings SET miss_count = ?, status = 'disabled', note = ?, olx_status = 'inactive' WHERE id = ?`,
);

/**
 * Ідемпотентно дописує маркер причини у note (патерн olx_status-disable з normalizer.ts).
 * `threshold` потрапляє у маркер (`miss_count=1` для deep / `=2` для normal); перевірка
 * за префіксом, тож повторний disable не дублює маркер навіть з іншим порогом.
 */
function appendCoverageNote(note: string | null, threshold: number): string {
  const marker = `${COVERAGE_NOTE_PREFIX}${threshold}`;
  if (note != null && note.includes(COVERAGE_NOTE_PREFIX)) return note;
  if (note == null || note === '') return marker;
  return `${note}\n${marker}`;
}

/**
 * Вікно покриття (CLAUDE.md / docs/plans/coverage-window-fix.md). Викликається ПІСЛЯ
 * upsertListings, лише для ПОВНИХ успішних GraphQL-сканів (не fallback, не часткових).
 *
 * Вісь вікна — `last_refresh_at` (дата підняття): OLX сортує видачу за
 * last_refresh_time DESC (запити передають sort_by=created_at:desc — verified live
 * 2026-06-12, docs/olx-api.md §2), тому покритий діапазон — [refresh останнього
 * отриманого; now]. posted_at (= created_time) для цього НЕпридатний: «підняті» старі
 * оголошення йдуть угорі видачі і розтягують вікно на роки (інцидент 2026-06-12,
 * 395 хибних disable).
 *
 * windowFloor = lastRefreshAt ОСТАННЬОГО елемента fetched (низ останньої сторінки;
 * не min() — промо-вкраплення поза порядком розтягнули б вікно) — або null, якщо
 * `exhausted` (видачу вичерпано, вікно = вся видача). Немає осі (порожній fetched
 * без exhausted, не-GraphQL дані) → прохід пропускається.
 *
 * Кандидати: рядки цього search зі status != 'disabled', відсутні у `fetched`,
 * і (windowFloor IS NULL OR last_refresh_at >= windowFloor; NULL-refresh — старі рядки
 * і «хвіст» за вікном пагінації — у кандидати не потрапляють, їх перевіряє verify).
 * Їм miss_count += 1; при miss_count >= `threshold` і (status_source='auto' OR
 * status='rejected') → status='disabled', olx_status='inactive' + маркер у note
 * (прозорість причини). `threshold` залежить від глибини скану: глибокий скан бачить усю
 * видачу, тож 1 промах — достатній доказ смерті; звичайний (≤3 запити) бачить лише верхівку,
 * тож дефолт 2 як буфер проти дрижання видачі (scanner.ts передає deep?1:2).
 */
export function applyScanStatuses(
  searchId: number,
  fetched: RawListing[],
  exhausted: boolean,
  threshold = 2,
): { disabled_count: number } {
  let windowFloor: string | null = null;

  if (!exhausted) {
    const lastItem = fetched[fetched.length - 1];
    windowFloor = lastItem?.lastRefreshAt ?? null;
    // Без осі покриття (порожня видача чи дані без refresh-дат) вердикти неможливі.
    if (windowFloor === null) return { disabled_count: 0 };
  }

  const fetchedIds = fetched.map((item) => item.olxId);

  const run = db.transaction(() => {
    let candidates: CandidateRow[];

    if (fetchedIds.length === 0) {
      candidates = (
        windowFloor === null
          ? db.prepare(
              `SELECT id, miss_count, status, status_source, note FROM listings
               WHERE search_id = ? AND status != 'disabled'`,
            )
          : db.prepare(
              `SELECT id, miss_count, status, status_source, note FROM listings
               WHERE search_id = ? AND status != 'disabled' AND last_refresh_at >= ?`,
            )
      ).all(...(windowFloor === null ? [searchId] : [searchId, windowFloor])) as CandidateRow[];
    } else {
      const placeholders = fetchedIds.map(() => '?').join(',');
      candidates = (
        windowFloor === null
          ? db.prepare(
              `SELECT id, miss_count, status, status_source, note FROM listings
               WHERE search_id = ? AND status != 'disabled' AND olx_id NOT IN (${placeholders})`,
            )
          : db.prepare(
              `SELECT id, miss_count, status, status_source, note FROM listings
               WHERE search_id = ? AND status != 'disabled' AND olx_id NOT IN (${placeholders}) AND last_refresh_at >= ?`,
            )
      ).all(
        ...(windowFloor === null
          ? [searchId, ...fetchedIds]
          : [searchId, ...fetchedIds, windowFloor]),
      ) as CandidateRow[];
    }

    let disabledCount = 0;
    for (const candidate of candidates) {
      const missCount = candidate.miss_count + 1;
      const becomesDisabled =
        missCount >= threshold &&
        (candidate.status_source === 'auto' || candidate.status === 'rejected');

      if (becomesDisabled) {
        disabledCount++;
        updateDisabledStmt.run(
          missCount,
          appendCoverageNote(candidate.note, threshold),
          candidate.id,
        );
      } else {
        updateCandidateStmt.run(missCount, candidate.status, candidate.note, candidate.id);
      }
    }

    return { disabled_count: disabledCount };
  });

  return run();
}
