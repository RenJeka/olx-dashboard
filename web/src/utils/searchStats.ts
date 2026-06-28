import type { Listing } from '../types';

const THREE_DAYS_MS = 3 * 24 * 60 * 60 * 1000;

/**
 * Парсинг SQLite-таймстемпа `YYYY-MM-DD HH:MM:SS` (зберігається як `datetime('now')` — UTC,
 * без таймзони) у мілісекунди. Додаємо `Z`, щоб не зловити локальний зсув. NULL/невалід → null.
 */
function parseUtcMs(ts: string | null): number | null {
  if (!ts) return null;
  const ms = Date.parse(ts.replace(' ', 'T') + 'Z');
  return Number.isNaN(ms) ? null : ms;
}

export interface ListingStats {
  in_db: number;
  stale_count: number;
  verify_candidates: number;
}

/**
 * Клієнтський аналог агрегату `/stats` — рахується з масиву listings (кеш `['listings', searchId]`),
 * щоб не робити окремий 408-рядковий прохід на сервері при кожному виборі пошуку
 * (Turso reads, docs/plans/turso-stats-clientside.md). `/listings` повертає всі рядки
 * `WHERE search_id=?` без фільтра → той самий набір, що рахував сервер, тож числа збігаються.
 *
 * Предикати — дзеркало `server/src/scanner/verifyScan.ts` (P1/P2) та
 * `routes/searches.ts` (stale): тримати синхронними при зміні будь-де.
 */
export function computeListingStats(listings: Listing[] | undefined): ListingStats {
  if (!listings) return { in_db: 0, stale_count: 0, verify_candidates: 0 };

  const staleThreshold = Date.now() - THREE_DAYS_MS;
  let stale_count = 0;
  let verify_candidates = 0;

  for (const l of listings) {
    const lastSeenMs = parseUtcMs(l.last_seen_at);
    // SQL: last_seen_at < datetime('now','-3 days'); NULL < x = NULL = false → null не stale.
    const isOld = lastSeenMs != null && lastSeenMs < staleThreshold;

    // stale_count: status_source='auto' AND last_seen_at старше 3 днів.
    if (l.status_source === 'auto' && isOld) stale_count++;

    // P1: url != null AND давно не бачене AND (auto OR rejected).
    const p1 = l.url != null && isOld && (l.status_source === 'auto' || l.status === 'rejected');
    // P2: url != null AND без опису AND не disabled AND NOT P1 (взаємовиключні).
    const p2 = l.url != null && l.description == null && l.status !== 'disabled' && !p1;
    if (p1 || p2) verify_candidates++;
  }

  return { in_db: listings.length, stale_count, verify_candidates };
}
