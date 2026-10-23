import { dbGet } from '../db.js';
import type { LastScanResponse } from '../../types.js';

/** Останній запуск будь-якого виду — для поллінгу прогресу глибокого скану. */
export function getLatestScanStatus(searchId: number): Promise<Record<string, unknown> | undefined> {
  return dbGet(
    `SELECT id, started_at, finished_at, found, new_count, raw_found, error, requests_done, requests_total,
              fetch_method, kind, stage, sub_done, sub_total
       FROM scan_runs WHERE search_id = ? ORDER BY id DESC LIMIT 1`,
    [searchId],
  );
}

/** Останній збережений аналіз (kind='analyze') з планом. */
export function getLatestAnalysis(
  searchId: number,
): Promise<{ finished_at: string | null; scan_plan: string } | undefined> {
  return dbGet<{ finished_at: string | null; scan_plan: string }>(
    `SELECT finished_at, scan_plan FROM scan_runs
       WHERE search_id = ? AND kind = 'analyze' AND scan_plan IS NOT NULL
       ORDER BY id DESC LIMIT 1`,
    [searchId],
  );
}

/** Останній не-аналітичний скан — для панелі дій. */
export function getLastScanSummary(searchId: number): Promise<NonNullable<LastScanResponse['last_scan']> | undefined> {
  return dbGet<NonNullable<LastScanResponse['last_scan']>>(
    `SELECT kind, started_at, finished_at, found, new_count, raw_found, disabled_count, error, warning
       FROM scan_runs WHERE search_id = ? AND kind != 'analyze' ORDER BY id DESC LIMIT 1`,
    [searchId],
  );
}
