import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BATCH_CHUNK, db } from '../db/db.js';
import { allListings, createSearch, insertListing, resetDb } from '../test/db.js';
import { recomputeFilteredOut } from './refilter.js';

// S16: збереження фільтра на великому пошуку падало (`fetch failed`) — усі UPDATE одним batch-ем.
beforeEach(resetDb);
afterEach(() => vi.restoreAllMocks());

describe('recomputeFilteredOut', () => {
  it('ставить filtered_out за фільтрами й пише лише змінені рядки', async () => {
    const searchId = await createSearch({ cities: ['Київ'] });
    await insertListing(searchId, 1, { city: 'Київ', filtered_out: 0 }); // без змін
    await insertListing(searchId, 2, { city: 'Львів', filtered_out: 0 }); // 0 → 1
    await insertListing(searchId, 3, { city: 'Львів', filtered_out: 1 }); // без змін
    await insertListing(searchId, 4, { city: 'Київ', filtered_out: 1 }); // 1 → 0

    const result = await recomputeFilteredOut(searchId);

    expect(result).toEqual({ filtered_out_count: 2, changed: 2 });
    expect((await allListings()).map((l) => l.filtered_out)).toEqual([0, 1, 1, 0]);
  });

  it('великий пошук пишеться batch-ами по ≤BATCH_CHUNK', async () => {
    const searchId = await createSearch({ cities: ['Київ'] });
    const total = BATCH_CHUNK + 1;
    await db.batch(
      Array.from({ length: total }, (_, i) => ({
        sql: 'INSERT INTO listings (olx_id, search_id, title, city) VALUES (?, ?, ?, ?)',
        args: [i + 1, searchId, `item ${i + 1}`, 'Львів'],
      })),
      'write',
    );
    const batch = vi.spyOn(db, 'batch');

    const result = await recomputeFilteredOut(searchId);

    expect(result.changed).toBe(total);
    expect(batch.mock.calls.map(([stmts]) => stmts.length)).toEqual([BATCH_CHUNK, 1]);
  });
});
