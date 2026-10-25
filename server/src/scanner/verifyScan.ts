import { dbAll, dbGet, dbRun } from '../db/db.js';
import { createVerifyProbe } from '../scraper/graphql/verifyProbe.js';
import type { FeedResult } from '../scraper/graphql/verifyProbe.js';
import { interruptibleSleep, randomDelayMs } from '../scraper/utils.js';
import {
  BATCH_PAUSE_MIN_MS,
  BATCH_PAUSE_MAX_MS,
  MIN_DELAY_MS,
  MAX_DELAY_MS,
} from '../scraper/constants.js';
import type { RawListing, VerifyResult } from '../types.js';
import { withScanRun } from './scanRunLifecycle.js';

/**
 * GraphQL-запитів за один verify-прохід — той самий порядок, що DEEP_SAFETY_CAP. Оцінка вартості
 * повного покриття великого пошуку — docs/plans/verify-graphql.md (тому основну роботу робить скан).
 */
export const VERIFY_REQUEST_CAP = 50;
/** Розмір батчу пауз — як у фетчерах (graphql/fetcher.ts). */
const VERIFY_BATCH_SIZE = 3;
/** Скільки кандидатів читати за прохід: з запасом на продавців, що покривають кількох одразу. */
const VERIFY_CANDIDATE_LIMIT = 500;
/** Промахів поспіль (скан повного покриття чи пошук за назвою) до вимкнення — як FULL_COVERAGE_MISS_THRESHOLD. */
export const VERIFY_MISS_THRESHOLD = 2;

export const VERIFY_SELLER_NOTE = 'auto-disabled: verify seller-feed';
export const VERIFY_MISS_NOTE_PREFIX = 'auto-disabled: verify miss_count=';

interface VerifyCandidateRow {
  id: number;
  olx_id: number;
  title: string | null;
  status: string;
  status_source: string;
  note: string;
  miss_count: number;
  seller_id: number | null;
  /** 1 — у рядку немає опису (для лічильника дозаповнення). */
  no_description: number;
}

// P1 (живість): промахи (miss_count > 0 — бліді рядки таблиці, будь-який статус, крім disabled) і давно не
// бачені auto-рядки або manual-rejected, яких жодне вікно покриття не врахувало. Вимкнені не перевіряються —
// їх реактивує скан, коли оголошення знову з'явиться у видачі. Промахи — першими.
export const P1_CONDITION = `
  status != 'disabled'
  AND (
    miss_count > 0
    OR (last_seen_at < datetime('now', '-3 days') AND (status_source = 'auto' OR status = 'rejected'))
  )
`;

// P2 (дозаповнення): рядки без опису, що ще активні — не в P1 (NOT (P1_CONDITION)).
// ORDER BY posted_at DESC — свіжі цінніші.
export const P2_CONDITION = `
  description IS NULL
  AND status != 'disabled'
  AND NOT (${P1_CONDITION})
`;

const CANDIDATE_COLUMNS =
  'id, olx_id, title, status, status_source, note, miss_count, seller_id, (description IS NULL) AS no_description';

/**
 * Кандидати verify-проходу (P1 спершу). `p1Count` — межа фаз для прогресу
 * (docs/plans/old/scan-progress-detail.md).
 */
async function loadVerifyCandidates(
  searchId: number,
  limit: number,
): Promise<{ candidates: VerifyCandidateRow[]; p1Count: number }> {
  const p1 = await dbAll<VerifyCandidateRow>(
    `SELECT ${CANDIDATE_COLUMNS} FROM listings WHERE search_id = ? AND ${P1_CONDITION}
     ORDER BY miss_count DESC, last_seen_at ASC, id ASC LIMIT ?`,
    [searchId, limit],
  );

  if (p1.length >= limit) return { candidates: p1, p1Count: p1.length };

  const p2 = await dbAll<VerifyCandidateRow>(
    `SELECT ${CANDIDATE_COLUMNS} FROM listings WHERE search_id = ? AND ${P2_CONDITION} ORDER BY posted_at DESC LIMIT ?`,
    [searchId, limit - p1.length],
  );

  return { candidates: [...p1, ...p2], p1Count: p1.length };
}

/** Загальна кількість кандидатів verify-проходу (P1+P2, без перетину) — для CLI й тестів (UI рахує сам). */
export async function countVerifyCandidates(searchId: number): Promise<number> {
  const p1 = await dbGet<{ cnt: number }>(
    `SELECT COUNT(*) AS cnt FROM listings WHERE search_id = ? AND ${P1_CONDITION}`,
    [searchId],
  );
  const p2 = await dbGet<{ cnt: number }>(
    `SELECT COUNT(*) AS cnt FROM listings WHERE search_id = ? AND ${P2_CONDITION}`,
    [searchId],
  );

  return (p1?.cnt ?? 0) + (p2?.cnt ?? 0);
}

/** Дописує marker у note, якщо його ще немає (ідемпотентність — патерн normalizer.ts). */
function appendVerifyNote(note: string, marker: string): string {
  if (note.includes(marker)) return note;
  return note === '' ? marker : `${note}\n${marker}`;
}

const canAutoDisable = (c: VerifyCandidateRow) => c.status_source === 'auto' || c.status === 'rejected';

// dead (видача продавця вичерпана без оголошення): 'inactive', не 'removed' — зникнення з видачі,
// а не підтверджений код сторінки.
const UPDATE_DISABLED_SQL = `UPDATE listings SET status = 'disabled', note = ?, olx_status = 'inactive', miss_count = ? WHERE id = ?`;
const UPDATE_MISS_SQL = 'UPDATE listings SET miss_count = ? WHERE id = ?';

// alive: оголошення є у видачі — як touch скану + дозаповнення порожніх полів.
const UPDATE_ALIVE_SQL = `
  UPDATE listings SET
    last_seen_at = datetime('now'),
    miss_count = 0,
    olx_status = COALESCE(@olx_status, olx_status),
    description = COALESCE(description, @description),
    seller_name = COALESCE(seller_name, @seller_name),
    seller_id = COALESCE(seller_id, @seller_id)
  WHERE id = @id
`;

const UPDATE_VERIFY_PROGRESS_SQL =
  'UPDATE scan_runs SET requests_done = ?, requests_total = ?, stage = ?, sub_done = ?, sub_total = ? WHERE id = ?';

const FINALIZE_VERIFY_SQL = `UPDATE scan_runs SET finished_at = ?, found = ?, new_count = ?, disabled_count = ?, error = ?, warning = ?,
     stage = NULL, sub_done = NULL, sub_total = NULL WHERE id = ?`;

/** Пауза перед наступним GraphQL-запитом — батчі по 3 з довшою паузою, як глибокий скан. */
function paceFor(shouldAbort: () => boolean) {
  return (requestsUsed: number) =>
    requestsUsed % VERIFY_BATCH_SIZE === 0
      ? interruptibleSleep(randomDelayMs(BATCH_PAUSE_MIN_MS, BATCH_PAUSE_MAX_MS), shouldAbort)
      : interruptibleSleep(randomDelayMs(MIN_DELAY_MS, MAX_DELAY_MS), shouldAbort);
}

/**
 * Verify-прохід без HTML (docs/plans/verify-graphql.md, частина 2): кандидати P1 (промахи + давно
 * не бачені) і P2 (без опису) перевіряються GraphQL-видачею, до VERIFY_REQUEST_CAP запитів:
 * - є `seller_id` → видача продавця: оголошення є → `alive`; видачу пройдено до кінця без нього →
 *   `dead` (auto/rejected → disabled); видача завелика чи ліміт → пошук за назвою;
 * - пошук за назвою: знайдено → `alive` (+ `seller_id`); вичерпана видача без нього → промах
 *   (VERIFY_MISS_THRESHOLD поспіль → disabled); видача більша за сторінку → `unknown`.
 * Збій GraphQL зупиняє прохід — перевірене зберігається, причина — у `scan_runs.error`.
 */
export async function runVerify(searchId: number): Promise<VerifyResult> {
  const search = await dbGet('SELECT id FROM searches WHERE id = ?', [searchId]);
  if (!search) {
    throw new Error(`Search ${searchId} не знайдено`);
  }

  return withScanRun(searchId, 'verify', async (ctx) => {
    const { candidates, p1Count } = await loadVerifyCandidates(searchId, VERIFY_CANDIDATE_LIMIT);
    const p2Count = candidates.length - p1Count;
    // Сегментована смуга прогресу має сенс лише коли ОБИДВІ фази мають кандидатів (scan-progress-detail.md).
    const hasTwoPhases = p1Count > 0 && p2Count > 0;
    // Прогрес — у запитах (ліміт проходу), не в кандидатах: один продавець покриває кількох, магазин —
    // кілька сторінок, тож total лише зростає разом із done.
    const plannedRequests = Math.min(VERIFY_REQUEST_CAP, candidates.length);
    await dbRun('UPDATE scan_runs SET requests_done = 0, requests_total = ? WHERE id = ?', [plannedRequests, ctx.runId]);

    const result: VerifyResult = {
      checked: 0,
      alive: 0,
      dead: 0,
      missed: 0,
      unknown: 0,
      disabled_count: 0,
      backfilled: 0,
    };
    const unknownIds: number[] = [];
    const probe = createVerifyProbe(paceFor(ctx.shouldAbort));
    const sellerFeeds = new Map<number, FeedResult>();
    let aborted = false;
    let failure: string | null = null;
    let budgetLeft = true;

    const markAlive = async (candidate: VerifyCandidateRow, item: RawListing) => {
      result.alive++;
      // COALESCE у SQL не перетирає наявне — рахуємо лише реально порожні поля.
      const fillsDescription = candidate.no_description === 1 && item.description != null;
      const fillsSeller = candidate.seller_id == null && item.sellerId != null;
      if (fillsDescription || fillsSeller) result.backfilled++;
      await dbRun(UPDATE_ALIVE_SQL, {
        id: candidate.id,
        olx_status: item.olxStatus ?? null,
        description: item.description ?? null,
        seller_name: item.sellerName ?? null,
        seller_id: item.sellerId ?? null,
      });
    };

    for (let i = 0; i < candidates.length; i++) {
      if (ctx.shouldAbort()) {
        aborted = true;
        break;
      }
      const candidate = candidates[i] as VerifyCandidateRow;
      const remaining = () => VERIFY_REQUEST_CAP - probe.requestsUsed;

      try {
        let feed: FeedResult | undefined;
        if (candidate.seller_id != null) {
          feed = sellerFeeds.get(candidate.seller_id);
          if (!feed) {
            if (remaining() <= 0) {
              budgetLeft = false;
              break;
            }
            feed = await probe.sellerFeed(candidate.seller_id, remaining());
            sellerFeeds.set(candidate.seller_id, feed);
          }
        }

        const sellerItem = feed?.items.get(candidate.olx_id);
        if (sellerItem) {
          result.checked++;
          await markAlive(candidate, sellerItem);
        } else if (feed?.exhausted) {
          result.checked++;
          result.dead++;
          if (canAutoDisable(candidate)) {
            const note = appendVerifyNote(candidate.note, VERIFY_SELLER_NOTE);
            await dbRun(UPDATE_DISABLED_SQL, [note, candidate.miss_count + 1, candidate.id]);
            result.disabled_count++;
          }
        } else if (candidate.title == null || candidate.title === '') {
          result.checked++;
          result.unknown++;
          unknownIds.push(candidate.olx_id);
        } else {
          if (remaining() <= 0) {
            budgetLeft = false;
            break;
          }
          const byTitle = await probe.byTitle(candidate.title);
          result.checked++;
          const titleItem = byTitle.items.get(candidate.olx_id);
          if (titleItem) {
            await markAlive(candidate, titleItem);
          } else if (byTitle.exhausted) {
            // Назву міг змінити продавець — тому лише промах; вимкнення після VERIFY_MISS_THRESHOLD поспіль.
            result.missed++;
            const missCount = candidate.miss_count + 1;
            if (missCount >= VERIFY_MISS_THRESHOLD && canAutoDisable(candidate)) {
              const note = appendVerifyNote(candidate.note, `${VERIFY_MISS_NOTE_PREFIX}${VERIFY_MISS_THRESHOLD}`);
              await dbRun(UPDATE_DISABLED_SQL, [note, missCount, candidate.id]);
              result.disabled_count++;
            } else {
              await dbRun(UPDATE_MISS_SQL, [missCount, candidate.id]);
            }
          } else {
            result.unknown++;
            unknownIds.push(candidate.olx_id);
          }
        }
      } catch (err) {
        failure = err instanceof Error ? err.message : String(err);
        break;
      }

      const phase = i < p1Count ? 'Перевірка живості' : 'Перевірка опису';
      const stage =
        `${phase} · #${candidate.olx_id} · ${candidate.seller_id != null ? 'видача продавця' : 'пошук за назвою'}` +
        ` · живих ${result.alive} · вимкнено ${result.disabled_count}`;
      await dbRun(UPDATE_VERIFY_PROGRESS_SQL, [
        probe.requestsUsed,
        Math.max(plannedRequests, probe.requestsUsed),
        stage,
        hasTwoPhases ? (i < p1Count ? 1 : 2) : null,
        hasTwoPhases ? 2 : null,
        ctx.runId,
      ]);
    }

    const left = candidates.length - result.checked;
    const warnings: string[] = [];
    if (aborted) warnings.push(`Зупинено користувачем — перевірено ${result.checked} з ${candidates.length}`);
    else if (!budgetLeft && left > 0) {
      warnings.push(`Ліміт ${VERIFY_REQUEST_CAP} запитів — перевірено ${result.checked}, лишилось ${left}; запустіть ще раз`);
    }
    if (unknownIds.length > 0) warnings.push(`без вердикту: ${unknownIds.map((id) => `#${id}`).join(', ')}`);

    await dbRun(FINALIZE_VERIFY_SQL, [
      new Date().toISOString(),
      result.checked,
      0,
      result.disabled_count,
      failure ? `verify зупинено: ${failure}` : null,
      warnings.length > 0 ? warnings.join('; ') : null,
      ctx.runId,
    ]);

    return result;
  });
}
