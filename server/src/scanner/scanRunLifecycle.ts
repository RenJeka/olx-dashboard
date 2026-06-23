import { db } from '../db/db.js';
import type { ScanProgress } from '../types.js';
import { abortFlags } from './abortControl.js';

/**
 * Контекст, доступний бізнес-логіці всередині `withScanRun`.
 * Lifecycle (створення запису, abort, прогрес, error-handling) керується обгорткою.
 */
export interface ScanRunContext {
  runId: number;
  shouldAbort: () => boolean;
  onProgress: (p: ScanProgress) => void;
}

// Unified prepared statement: `fetch_method` — через COALESCE (analyze не має його,
// решта scan-видів мають). `stage` завжди перезаписується (транзієнтний текст).
const updateProgressStmt = db.prepare(
  `UPDATE scan_runs SET
     requests_done = ?,
     requests_total = COALESCE(?, requests_total),
     fetch_method = COALESCE(?, fetch_method),
     stage = ?,
     sub_done = COALESCE(?, sub_done),
     sub_total = COALESCE(?, sub_total)
   WHERE id = ?`,
);

const insertRunStmt = db.prepare(
  'INSERT INTO scan_runs (search_id, started_at, kind) VALUES (?, ?, ?)',
);

const finalizeErrorStmt = db.prepare(
  `UPDATE scan_runs SET finished_at = ?, error = ?,
     stage = NULL, sub_done = NULL, sub_total = NULL WHERE id = ?`,
);

/**
 * Обгортка lifecycle для scan_runs: створює запис, налаштовує abort/progress,
 * записує помилку при збої, прибирає прапорець abort у finally.
 *
 * Вся бізнес-логіка виконується у `body(ctx)` — обгортка гарантує коректний
 * teardown незалежно від результату.
 */
export async function withScanRun<T>(
  searchId: number,
  kind: string,
  body: (ctx: ScanRunContext) => Promise<T>,
): Promise<T> {
  abortFlags.set(searchId, false);
  const shouldAbort = (): boolean => abortFlags.get(searchId) === true;

  const runId = Number(
    insertRunStmt.run(searchId, new Date().toISOString(), kind).lastInsertRowid,
  );

  const onProgress = (p: ScanProgress): void => {
    updateProgressStmt.run(
      p.done,
      p.total ?? null,
      p.method ?? null,
      p.stage ?? null,
      p.subDone ?? null,
      p.subTotal ?? null,
      runId,
    );
  };

  try {
    return await body({ runId, shouldAbort, onProgress });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    finalizeErrorStmt.run(new Date().toISOString(), message, runId);
    throw err;
  } finally {
    abortFlags.delete(searchId);
  }
}
