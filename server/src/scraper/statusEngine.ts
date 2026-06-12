import { db } from '../db/db.js';
import type { RawListing } from '../types.js';

interface CandidateRow {
  id: number;
  miss_count: number;
  status: string;
  status_source: string;
}

const updateCandidateStmt = db.prepare(
  'UPDATE listings SET miss_count = ?, status = ? WHERE id = ?',
);

/**
 * Вікно покриття (CLAUDE.md / план Етапу 2 §«Вікно покриття»). Викликається ПІСЛЯ
 * upsertListings, лише для успішних GraphQL-сканів (не fallback).
 *
 * windowFloor = min(posted_at) серед `fetched` — або null, якщо `exhausted`
 * (остання сторінка <40 → видачу вичерпано, вікно = вся видача).
 *
 * Кандидати: рядки цього search зі status != 'disabled', відсутні у `fetched`,
 * і (windowFloor IS NULL OR posted_at >= windowFloor). Їм miss_count += 1; при
 * miss_count >= 2 і (status_source='auto' OR status='rejected') → status='disabled'.
 *
 * `posted_at` гарантовано ISO або NULL (нормалізатор завжди пропускає текстові дати
 * HTML-fallback через `parseOlxDate`, дивись normalizer.ts/dateParser.ts) — лексикографічне
 * порівняння з windowFloor коректне. NULL >= windowFloor у SQLite дає NULL (рядок без дати
 * не потрапляє в кандидати — без дати немає підстав вважати його «в межах вікна»).
 */
export function applyScanStatuses(
  searchId: number,
  fetched: RawListing[],
  exhausted: boolean,
): { disabled_count: number } {
  const postedDates = fetched
    .map((item) => item.createdAt)
    .filter((d): d is string => Boolean(d));

  const windowFloor = exhausted
    ? null
    : postedDates.reduce<string | null>(
        (min, d) => (min === null || d < min ? d : min),
        null,
      );

  const fetchedIds = fetched.map((item) => item.olxId);

  const run = db.transaction(() => {
    let candidates: CandidateRow[];

    if (fetchedIds.length === 0) {
      candidates = (
        windowFloor === null
          ? db.prepare(
              `SELECT id, miss_count, status, status_source FROM listings
               WHERE search_id = ? AND status != 'disabled'`,
            )
          : db.prepare(
              `SELECT id, miss_count, status, status_source FROM listings
               WHERE search_id = ? AND status != 'disabled' AND posted_at >= ?`,
            )
      ).all(...(windowFloor === null ? [searchId] : [searchId, windowFloor])) as CandidateRow[];
    } else {
      const placeholders = fetchedIds.map(() => '?').join(',');
      candidates = (
        windowFloor === null
          ? db.prepare(
              `SELECT id, miss_count, status, status_source FROM listings
               WHERE search_id = ? AND status != 'disabled' AND olx_id NOT IN (${placeholders})`,
            )
          : db.prepare(
              `SELECT id, miss_count, status, status_source FROM listings
               WHERE search_id = ? AND status != 'disabled' AND olx_id NOT IN (${placeholders}) AND posted_at >= ?`,
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
        missCount >= 2 &&
        (candidate.status_source === 'auto' || candidate.status === 'rejected');

      if (becomesDisabled) disabledCount++;

      updateCandidateStmt.run(
        missCount,
        becomesDisabled ? 'disabled' : candidate.status,
        candidate.id,
      );
    }

    return { disabled_count: disabledCount };
  });

  return run();
}
