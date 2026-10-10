import { beforeEach, describe, expect, it, vi } from 'vitest';
import { dbGet, dbRun } from '../db/db.js';
import { createSearch, getListing, insertListing, resetDb } from '../test/db.js';
import type { ProbeResult } from '../scraper/verifier.js';

// Запобіжник verify-проходу від 403 OLX (docs/plans/verify-403-guard.md): проба й паузи замокані —
// жодного запиту до OLX і жодного очікування.
const probe = vi.hoisted(() => vi.fn<(url: string) => Promise<ProbeResult>>());
vi.mock('../scraper/verifier.js', () => ({ probeListingPage: probe }));
vi.mock('../scraper/utils.js', async (orig) => ({
  ...(await orig<typeof import('../scraper/utils.js')>()),
  interruptibleSleep: async () => {},
}));

const { runVerify, VERIFY_BLOCKED_ERROR, VERIFY_BLOCK_STREAK } = await import('./verifyScan.js');

const unknown = (httpStatus: number): ProbeResult => ({ verdict: 'unknown', httpStatus, description: null, sellerName: null });

let searchId: number;

beforeEach(async () => {
  await resetDb();
  probe.mockReset();
  searchId = await createSearch();
  // Кандидати P1: давно не бачені auto-рядки з url.
  for (let olxId = 1; olxId <= 6; olxId++) {
    await insertListing(searchId, olxId);
  }
  await dbRun(
    `UPDATE listings SET url = 'https://www.olx.ua/d/uk/obyavlenie/item-' || olx_id || '.html',
       last_seen_at = datetime('now', '-10 days')`,
  );
});

const lastRunError = async () =>
  (await dbGet<{ error: string | null }>('SELECT error FROM scan_runs ORDER BY id DESC LIMIT 1'))?.error;

describe('runVerify — запобіжник від 403', () => {
  it('серія 403 зупиняє прохід: одне повідомлення, статуси не змінені', async () => {
    probe.mockResolvedValue(unknown(403));

    const result = await runVerify(searchId);

    expect(probe).toHaveBeenCalledTimes(VERIFY_BLOCK_STREAK);
    expect(result.checked).toBe(VERIFY_BLOCK_STREAK);
    expect(result.disabled_count).toBe(0);
    expect(await lastRunError()).toBe(VERIFY_BLOCKED_ERROR);
    expect((await getListing(1))?.status).toBe('new');
  });

  it('403 без серії — прохід іде до кінця, помилка — список unknown', async () => {
    probe.mockImplementation(async (url) => unknown(/item-[135]\./.test(url) ? 403 : 500));

    const result = await runVerify(searchId);

    expect(result.checked).toBe(6);
    expect(await lastRunError()).toMatch(/^verify unknown: #\d+: http=(403|500)/);
  });
});
