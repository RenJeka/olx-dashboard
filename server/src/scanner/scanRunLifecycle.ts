import { dbRun } from '../db/db.js';
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

// Unified SQL: `fetch_method` — через COALESCE (analyze не має його, решта scan-видів мають).
// `stage` завжди перезаписується (транзієнтний текст).
const UPDATE_PROGRESS_SQL = `UPDATE scan_runs SET
     requests_done = ?,
     requests_total = COALESCE(?, requests_total),
     fetch_method = COALESCE(?, fetch_method),
     stage = ?,
     sub_done = COALESCE(?, sub_done),
     sub_total = COALESCE(?, sub_total)
   WHERE id = ?`;

const INSERT_RUN_SQL = 'INSERT INTO scan_runs (search_id, started_at, kind) VALUES (?, ?, ?)';

// Мін. інтервал між записами прогресу в БД (поллінг фронту — 1.5 с, частіше писати немає сенсу).
const PROGRESS_WRITE_THROTTLE_MS = 1000;

const FINALIZE_ERROR_SQL = `UPDATE scan_runs SET finished_at = ?, error = ?,
     stage = NULL, sub_done = NULL, sub_total = NULL WHERE id = ?`;

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
    (await dbRun(INSERT_RUN_SQL, [searchId, new Date().toISOString(), kind])).lastInsertRowid,
  );

  // Прогрес — best-effort: callback лишається синхронним (void), запис fire-and-forget із
  // ковтанням помилки. Деталі прогресу косметичні (поллінг scan-status раз на 1.5 с), тож
  // тротлимо записи ≥ PROGRESS_WRITE_THROTTLE_MS — інакше глибокий скан робить десятки-сотні
  // зайвих UPDATE до Turso. Фінальний стан фіксує окремий finalize-запис після завершення body.
  let lastWriteAt = 0;
  const onProgress = (p: ScanProgress): void => {
    const now = Date.now();
    if (now - lastWriteAt < PROGRESS_WRITE_THROTTLE_MS) return;
    lastWriteAt = now;
    void dbRun(UPDATE_PROGRESS_SQL, [
      p.done,
      p.total ?? null,
      p.method ?? null,
      p.stage ?? null,
      p.subDone ?? null,
      p.subTotal ?? null,
      runId,
    ]).catch(() => {});
  };

  try {
    return await body({ runId, shouldAbort, onProgress });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await dbRun(FINALIZE_ERROR_SQL, [new Date().toISOString(), message, runId]);
    throw err;
  } finally {
    abortFlags.delete(searchId);
  }
}
