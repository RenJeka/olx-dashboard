import { dbAll, dbGet, dbRun } from '../db/db.js';
import { probeListingPage } from '../scraper/verifier.js';
import { interruptibleSleep, randomDelayMs } from '../scraper/utils.js';
import {
  BATCH_PAUSE_MIN_MS,
  BATCH_PAUSE_MAX_MS,
  MIN_DELAY_MS,
  MAX_DELAY_MS,
} from '../scraper/constants.js';
import type { VerifyResult } from '../types.js';
import { withScanRun } from './scanRunLifecycle.js';

/** Сторінок за один verify-прохід (P1+P2 разом) — той самий порядок, що DEEP_SAFETY_CAP. */
const VERIFY_PAGE_CAP = 50;
/** Розмір батчу — як у фетчерах (graphql/fetcher.ts, olxFetcher.ts). */
const VERIFY_BATCH_SIZE = 3;

interface VerifyCandidateRow {
  id: number;
  olx_id: number;
  url: string;
  status: string;
  status_source: string;
  note: string;
  description: string | null;
  seller_name: string | null;
}

// P1 (живість): давно не бачені auto-рядки або manual-rejected — включно зі status='disabled'
// (auto), щоб дати шанс на реактивацію. ORDER BY last_seen_at ASC — найдавніші спершу.
// Експортується для реюзу в агрегаті /stats (єдине джерело предикату verify-кандидатів).
export const P1_CONDITION = `
  url IS NOT NULL
  AND last_seen_at < datetime('now', '-3 days')
  AND (status_source = 'auto' OR status = 'rejected')
`;

// P2 (дозаповнення): рядки без опису, що ще активні — не в P1 (NOT (P1_CONDITION)).
// ORDER BY posted_at DESC — свіжі цінніші.
export const P2_CONDITION = `
  url IS NOT NULL
  AND description IS NULL
  AND status != 'disabled'
  AND NOT (${P1_CONDITION})
`;

/**
 * Кандидати verify-проходу (≤ cap, P1 спершу). Реалізація — `docs/plans/verify-pass.md` групи B1.
 * `p1Count` — межа фаз (P1 живість / P2 дозаповнення) для прогресу (docs/plans/scan-progress-detail.md).
 */
async function loadVerifyCandidates(
  searchId: number,
  cap: number,
): Promise<{ candidates: VerifyCandidateRow[]; p1Count: number }> {
  const columns = 'id, olx_id, url, status, status_source, note, description, seller_name';

  const p1 = await dbAll<VerifyCandidateRow>(
    `SELECT ${columns} FROM listings WHERE search_id = ? AND ${P1_CONDITION} ORDER BY last_seen_at ASC LIMIT ?`,
    [searchId, cap],
  );

  if (p1.length >= cap) return { candidates: p1, p1Count: p1.length };

  const p2 = await dbAll<VerifyCandidateRow>(
    `SELECT ${columns} FROM listings WHERE search_id = ? AND ${P2_CONDITION} ORDER BY posted_at DESC LIMIT ?`,
    [searchId, cap - p1.length],
  );

  return { candidates: [...p1, ...p2], p1Count: p1.length };
}

/** Загальна кількість кандидатів verify-проходу (P1+P2, без перетину) — для /stats. */
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

// dead → olx_status='removed' (підтверджено прямою пробою 410/404 — точніше за coverage 'inactive').
const UPDATE_DEAD_SQL = `UPDATE listings SET status = 'disabled', note = ?, olx_status = 'removed' WHERE id = ?`;

// alive: при реактивації (disabled→new) сторінка живою підтверджена (200+опис) → olx_status='active';
// без реактивації olx_status не чіпаємо (probe — HTML, сирого статусу OLX не дає).
const UPDATE_ALIVE_SQL = `
  UPDATE listings SET
    last_seen_at = datetime('now'),
    miss_count = 0,
    status = @status,
    olx_status = CASE WHEN @reactivate = 1 THEN 'active' ELSE olx_status END,
    description = COALESCE(description, @description),
    seller_name = COALESCE(seller_name, @seller_name)
  WHERE id = @id
`;

const UPDATE_VERIFY_PROGRESS_SQL = `UPDATE scan_runs SET requests_done = ?, stage = ?, sub_done = ?, sub_total = ? WHERE id = ?`;

const FINALIZE_VERIFY_SQL = `UPDATE scan_runs SET finished_at = ?, found = ?, new_count = ?, disabled_count = ?, error = ?, warning = ?,
     stage = NULL, sub_done = NULL, sub_total = NULL WHERE id = ?`;

/**
 * Verify-прохід (Етап 2 A3, `docs/plans/verify-pass.md`): пряма перевірка сторінок
 * оголошень — живість (P1, давно не бачені) + дозаповнення description/seller_name
 * для рядків за межами вікна пагінації GraphQL (P2). До VERIFY_PAGE_CAP сторінок,
 * батчі по VERIFY_BATCH_SIZE з паузами (як глибокий скан). Прогрес — через
 * scan_runs.requests_done/requests_total (поллінг GET /scan-status).
 *
 * Маркери (docs/olx-api.md §3.4, верифіковано live 2026-06-12): 404|410 → dead;
 * 200 + `ad_description` → alive; інше → unknown (статус не змінюється).
 */
export async function runVerify(searchId: number): Promise<VerifyResult> {
  const search = await dbGet('SELECT id FROM searches WHERE id = ?', [searchId]);
  if (!search) {
    throw new Error(`Search ${searchId} не знайдено`);
  }

  return withScanRun(searchId, 'verify', async (ctx) => {
    const { candidates, p1Count } = await loadVerifyCandidates(searchId, VERIFY_PAGE_CAP);
    const total = candidates.length;
    const p2Count = total - p1Count;
    // Сегментована смуга прогресу має сенс лише коли ОБИДВІ фази мають кандидатів — інакше
    // прохід однофазний і sub_total лишаємо NULL (docs/plans/scan-progress-detail.md).
    const hasTwoPhases = p1Count > 0 && p2Count > 0;
    await dbRun('UPDATE scan_runs SET requests_done = 0, requests_total = ? WHERE id = ?', [
      total,
      ctx.runId,
    ]);

    const result: VerifyResult = {
      checked: 0,
      alive: 0,
      dead: 0,
      unknown: 0,
      reactivated: 0,
      disabled_count: 0,
      backfilled: 0,
    };
    const unknownIssues: string[] = [];
    let aborted = false;

    for (let i = 0; i < candidates.length; i++) {
      if (ctx.shouldAbort()) {
        aborted = true;
        break;
      }
      const candidate = candidates[i] as VerifyCandidateRow;
      const probe = await probeListingPage(candidate.url);
      result.checked++;

      if (probe.verdict === 'dead') {
        result.dead++;
        if (candidate.status_source === 'auto' || candidate.status === 'rejected') {
          const marker = `auto-disabled: verify http=${probe.httpStatus}`;
          await dbRun(UPDATE_DEAD_SQL, [appendVerifyNote(candidate.note, marker), candidate.id]);
          result.disabled_count++;
        }
      } else if (probe.verdict === 'alive') {
        result.alive++;
        const reactivate = candidate.status === 'disabled' && candidate.status_source === 'auto';
        if (reactivate) result.reactivated++;

        const backfillsDescription = candidate.description == null && probe.description != null;
        const backfillsSeller = candidate.seller_name == null && probe.sellerName != null;
        if (backfillsDescription || backfillsSeller) result.backfilled++;

        await dbRun(UPDATE_ALIVE_SQL, {
          id: candidate.id,
          status: reactivate ? 'new' : candidate.status,
          reactivate: reactivate ? 1 : 0,
          description: probe.description,
          seller_name: probe.sellerName,
        });
      } else {
        result.unknown++;
        unknownIssues.push(
          `#${candidate.olx_id}: ${probe.httpStatus == null ? 'мережева помилка' : `http=${probe.httpStatus}`}`,
        );
      }

      const phase = i < p1Count ? 'Перевірка живості' : 'Перевірка опису';
      const stage = `${phase} · #${candidate.olx_id} · живих ${result.alive} · мертвих ${result.dead}`;
      await dbRun(UPDATE_VERIFY_PROGRESS_SQL, [
        i + 1,
        stage,
        hasTwoPhases ? (i < p1Count ? 1 : 2) : null,
        hasTwoPhases ? 2 : null,
        ctx.runId,
      ]);

      if (i < candidates.length - 1) {
        if ((i + 1) % VERIFY_BATCH_SIZE === 0) {
          await interruptibleSleep(randomDelayMs(BATCH_PAUSE_MIN_MS, BATCH_PAUSE_MAX_MS), ctx.shouldAbort);
        } else {
          await interruptibleSleep(randomDelayMs(MIN_DELAY_MS, MAX_DELAY_MS), ctx.shouldAbort);
        }
      }
    }

    const error = unknownIssues.length > 0 ? `verify unknown: ${unknownIssues.join('; ')}` : null;
    const warning = aborted ? `Зупинено користувачем — перевірено ${result.checked} з ${total}` : null;

    await dbRun(FINALIZE_VERIFY_SQL, [
      new Date().toISOString(),
      result.checked,
      result.reactivated,
      result.disabled_count,
      error,
      warning,
      ctx.runId,
    ]);

    return result;
  });
}
