import { beforeEach, describe, expect, it, vi } from 'vitest';
import { dbGet, dbRun } from '../db/db.js';
import { createSearch, getListing, gqlListing, insertListing, resetDb } from '../test/db.js';
import type { FeedResult } from '../scraper/graphql/verifyProbe.js';
import type { RawListing } from '../types.js';

// Verify через GraphQL-видачу (docs/plans/verify-graphql.md): проба замокана — жодного запиту до OLX
// і жодної паузи. Кожен виклик sellerFeed/byTitle рахується як 1 запит.
const sellerFeed = vi.hoisted(() => vi.fn<(sellerId: number, maxRequests: number) => Promise<FeedResult>>());
const byTitle = vi.hoisted(() => vi.fn<(title: string) => Promise<FeedResult>>());
vi.mock('../scraper/graphql/verifyProbe.js', () => ({
  createVerifyProbe: () => {
    let requestsUsed = 0;
    return {
      get requestsUsed() {
        return requestsUsed;
      },
      sellerFeed: async (sellerId: number, maxRequests: number) => {
        requestsUsed++;
        return sellerFeed(sellerId, maxRequests);
      },
      byTitle: async (title: string) => {
        requestsUsed++;
        return byTitle(title);
      },
    };
  },
}));

const { runVerify, countVerifyCandidates, VERIFY_REQUEST_CAP, VERIFY_SELLER_NOTE } = await import('./verifyScan.js');

const feed = (items: RawListing[], exhausted = true): FeedResult => ({
  items: new Map(items.map((it) => [it.olxId, it])),
  exhausted,
});

const STALE = "datetime('now', '-10 days')";
let searchId: number;

beforeEach(async () => {
  await resetDb();
  sellerFeed.mockReset();
  byTitle.mockReset();
  searchId = await createSearch();
});

/** Давно не бачений auto-рядок (кандидат P1). */
async function staleListing(olxId: number, fields: Parameters<typeof insertListing>[2] = {}) {
  await insertListing(searchId, olxId, { description: 'опис', ...fields });
  await dbRun(`UPDATE listings SET last_seen_at = ${STALE} WHERE olx_id = ?`, [olxId]);
}

const lastRun = async () =>
  dbGet<{ error: string | null; warning: string | null; disabled_count: number }>(
    'SELECT error, warning, disabled_count FROM scan_runs ORDER BY id DESC LIMIT 1',
  );

describe('runVerify — видача продавця', () => {
  it('оголошення є у видачі → живе: last_seen_at оновлено, miss_count=0, опис дозаповнено', async () => {
    await staleListing(1, { seller_id: 7, miss_count: 1, description: null });
    sellerFeed.mockResolvedValue(feed([gqlListing(1, { sellerId: 7, description: 'новий опис' })]));

    const result = await runVerify(searchId);

    expect(result).toMatchObject({ checked: 1, alive: 1, backfilled: 1, disabled_count: 0 });
    const row = await getListing(1);
    expect(row).toMatchObject({ status: 'new', miss_count: 0, description: 'новий опис' });
    expect(row?.last_seen_at).not.toBeNull();
    expect(await countVerifyCandidates(searchId)).toBe(0);
  });

  it('видача вичерпана без оголошення, auto → disabled з позначкою; повторний прохід не дублює', async () => {
    await staleListing(1, { seller_id: 7 });
    sellerFeed.mockResolvedValue(feed([gqlListing(99, { sellerId: 7 })]));

    expect(await runVerify(searchId)).toMatchObject({ dead: 1, disabled_count: 1 });
    const row = await getListing(1);
    expect(row).toMatchObject({ status: 'disabled', olx_status: 'inactive' });
    expect(row?.note).toBe(VERIFY_SELLER_NOTE);
  });

  it('manual interested не вимикається; manual rejected — вимикається', async () => {
    await staleListing(1, { seller_id: 7, status: 'interested', status_source: 'manual', miss_count: 1 });
    await staleListing(2, { seller_id: 7, status: 'rejected', status_source: 'manual' });
    sellerFeed.mockResolvedValue(feed([]));

    await runVerify(searchId);

    expect((await getListing(1))?.status).toBe('interested');
    expect((await getListing(2))?.status).toBe('disabled');
  });

  it('кілька кандидатів одного продавця → один запит видачі', async () => {
    await staleListing(1, { seller_id: 7 });
    await staleListing(2, { seller_id: 7 });
    sellerFeed.mockResolvedValue(feed([gqlListing(1, { sellerId: 7 }), gqlListing(2, { sellerId: 7 })]));

    expect(await runVerify(searchId)).toMatchObject({ checked: 2, alive: 2 });
    expect(sellerFeed).toHaveBeenCalledTimes(1);
  });

  it('видача продавця не вичерпана → перевірка за назвою', async () => {
    await staleListing(1, { seller_id: 7 });
    sellerFeed.mockResolvedValue(feed([], false));
    byTitle.mockResolvedValue(feed([gqlListing(1, { sellerId: 7 })]));

    expect(await runVerify(searchId)).toMatchObject({ alive: 1 });
    expect(byTitle).toHaveBeenCalledWith('item 1');
  });
});

describe('runVerify — пошук за назвою', () => {
  it('знайдено → живе і seller_id записано', async () => {
    await staleListing(1);
    byTitle.mockResolvedValue(feed([gqlListing(1, { sellerId: 55 })]));

    expect(await runVerify(searchId)).toMatchObject({ alive: 1, backfilled: 1 });
    expect((await getListing(1))?.seller_id).toBe(55);
    expect(sellerFeed).not.toHaveBeenCalled();
  });

  it('не знайдено у вичерпаній видачі → промах; другий промах поспіль → disabled', async () => {
    await staleListing(1);
    byTitle.mockResolvedValue(feed([]));

    expect(await runVerify(searchId)).toMatchObject({ missed: 1, disabled_count: 0 });
    expect(await getListing(1)).toMatchObject({ status: 'new', miss_count: 1 });

    expect(await runVerify(searchId)).toMatchObject({ missed: 1, disabled_count: 1 });
    const row = await getListing(1);
    expect(row).toMatchObject({ status: 'disabled', miss_count: 2, olx_status: 'inactive' });
    expect(row?.note).toContain('auto-disabled: verify miss_count=2');
  });

  it('видача більша за сторінку без оголошення → без вердикту, рядок не змінено', async () => {
    await staleListing(1);
    byTitle.mockResolvedValue(feed([gqlListing(5)], false));

    expect(await runVerify(searchId)).toMatchObject({ unknown: 1, missed: 0 });
    expect((await getListing(1))?.miss_count).toBe(0);
    expect((await lastRun())?.warning).toContain('#1');
  });
});

describe('runVerify — кандидати, ліміт і збої', () => {
  it('disabled не перевіряється; свіжий рядок із промахом — кандидат (будь-який статус)', async () => {
    await staleListing(1, { status: 'disabled' });
    await insertListing(searchId, 2, { description: 'опис', status: 'interested', status_source: 'manual', miss_count: 1 });
    await dbRun("UPDATE listings SET last_seen_at = datetime('now') WHERE olx_id = 2");

    expect(await countVerifyCandidates(searchId)).toBe(1);
  });

  it('ліміт запитів вичерпано → прохід завершується, решта не чіпається, у warning — підказка', async () => {
    for (let id = 1; id <= VERIFY_REQUEST_CAP + 2; id++) await staleListing(id);
    byTitle.mockResolvedValue(feed([]));

    const result = await runVerify(searchId);

    expect(byTitle).toHaveBeenCalledTimes(VERIFY_REQUEST_CAP);
    expect(result.checked).toBe(VERIFY_REQUEST_CAP);
    expect((await lastRun())?.warning).toContain(`Ліміт ${VERIFY_REQUEST_CAP} запитів`);
  });

  it('збій GraphQL → прохід зупиняється, перевірене збережено, причина в error', async () => {
    await staleListing(1);
    await staleListing(2);
    byTitle.mockResolvedValueOnce(feed([gqlListing(1)])).mockRejectedValueOnce(new Error('HTTP 403'));

    const result = await runVerify(searchId);

    expect(result).toMatchObject({ checked: 1, alive: 1 });
    expect((await lastRun())?.error).toBe('verify зупинено: HTTP 403');
  });
});
