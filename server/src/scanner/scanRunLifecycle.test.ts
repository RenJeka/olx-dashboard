import { beforeEach, describe, expect, it } from 'vitest';
import { dbAll, dbRun } from '../db/db.js';
import { createSearch, resetDb } from '../test/db.js';
import { INTERRUPTED_SCAN_ERROR, closeInterruptedScanRuns } from './scanRunLifecycle.js';

// Обірвані скани (процес зупинився посеред скану — засинання/рестарт Render) закриваються
// на старті сервера, щоб не лишались «вічними» (docs/plans/scan-keepalive.md, S9).

interface RunRow {
  id: number;
  finished_at: string | null;
  error: string | null;
  stage: string | null;
}

let searchId: number;

beforeEach(async () => {
  await resetDb();
  searchId = await createSearch();
});

async function insertRun(finishedAt: string | null, error: string | null = null): Promise<number> {
  const res = await dbRun(
    `INSERT INTO scan_runs (search_id, kind, started_at, finished_at, error, stage, sub_done, sub_total)
     VALUES (?, 'deep', '2026-10-02T13:10:42.655Z', ?, ?, ?, ?, ?)`,
    [searchId, finishedAt, error, finishedAt ? null : 'Синонім «iphone» (11/16)', 11, 16],
  );
  return Number(res.lastInsertRowid);
}

describe('closeInterruptedScanRuns', () => {
  it('закриває лише незавершені скани: finished_at, error, без транзієнтного прогресу', async () => {
    const done = await insertRun('2026-10-02T13:04:27.841Z');
    const failed = await insertRun('2026-10-02T13:05:00.000Z', 'graphql failed');
    const orphan = await insertRun(null);

    expect(await closeInterruptedScanRuns()).toBe(1);

    const rows = await dbAll<RunRow>('SELECT id, finished_at, error, stage FROM scan_runs ORDER BY id');
    const byId = new Map(rows.map((r) => [r.id, r]));
    expect(byId.get(done)).toMatchObject({ finished_at: '2026-10-02T13:04:27.841Z', error: null });
    expect(byId.get(failed)).toMatchObject({ error: 'graphql failed' });
    expect(byId.get(orphan)?.finished_at).not.toBeNull();
    expect(byId.get(orphan)).toMatchObject({ error: INTERRUPTED_SCAN_ERROR, stage: null });
  });

  it('немає обірваних — 0, нічого не змінює', async () => {
    await insertRun('2026-10-02T13:04:27.841Z');
    expect(await closeInterruptedScanRuns()).toBe(0);
  });
});
