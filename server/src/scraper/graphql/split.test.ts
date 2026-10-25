import { describe, expect, it, vi } from 'vitest';
import { gqlListing } from '../../test/db.js';
import type { SearchConfig } from '../../types.js';
import type { GraphqlClient, PageResult } from './client.js';
import type { PriceBucket } from './types.js';

// Повне покриття split-скану (docs/plans/verify-graphql.md): без мережі й пауз.
vi.mock('../utils.js', async (orig) => ({
  ...(await orig<typeof import('../utils.js')>()),
  interruptibleSleep: async () => {},
}));
const { SplitScanner } = await import('./split.js');

const search: SearchConfig = { id: 1, name: 'test', query: 'iphone', apiFilters: {} };
const page = (from: number, n: number): PageResult => ({
  items: Array.from({ length: n }, (_, i) => gqlListing(from + i)),
  visibleTotalCount: null,
  listingError: null,
});

function scannerReturning(pages: PageResult[]) {
  const fetchPage = vi.fn(async () => pages.shift() ?? page(0, 0));
  return new SplitScanner({ fetchPage, buildReferer: () => '' } as unknown as GraphqlClient);
}

describe('SplitScanner.scanBuckets — вичерпання', () => {
  it('count кратний 40: остання обіцяна сторінка повна — бакет усе одно вичерпано', async () => {
    const bucket: PriceBucket = { from: 0, to: 1000, count: 80, page0: page(1, 40).items };
    const res = await scannerReturning([page(41, 40)]).scanBuckets(search, '', [], [bucket], 0);
    expect(res).toMatchObject({ allExhausted: true, capHit: false });
    expect(res.listings).toHaveLength(80);
  });

  it('бакет із ListingError під час зондування — повного покриття немає', async () => {
    const failed: PriceBucket = { from: 0, to: 1000, count: 0, page0: [], failed: true };
    const res = await scannerReturning([]).scanBuckets(search, '', [], [failed], 0);
    expect(res.allExhausted).toBe(false);
  });
});
