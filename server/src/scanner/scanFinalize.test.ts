import { beforeEach, describe, expect, it, vi } from 'vitest';
import { db, dbGet } from '../db/db.js';
import { createSearch, resetDb } from '../test/db.js';
import type { SearchConfig } from '../types.js';

// Хвіст скану: facet категорій і автокатегорія — best-effort; мережі немає (facet замокано).
const logWarn = vi.hoisted(() => vi.fn());
vi.mock('../logger.js', () => ({ logWarn, logError: vi.fn() }));
const facetMock = vi.hoisted(() => vi.fn());
vi.mock('../scraper/graphql/categories.js', () => ({ fetchCategoryFacet: facetMock }));
const refreshBase = vi.hoisted(() => vi.fn(async () => null));
vi.mock('../categories/tree.js', async (orig) => ({
  ...(await orig<typeof import('../categories/tree.js')>()),
  refreshBaseCategory: refreshBase,
}));

import { finalizeScanResult, refreshCategoryFacet } from './scanFinalize.js';

const FACET_BEFORE = JSON.stringify([{ id: 37, path: ['Електроніка'], olxCount: 5 }]);
let searchId: number;

beforeEach(async () => {
  await resetDb();
  searchId = await createSearch();
  await db.execute({ sql: 'UPDATE searches SET category_facet = ? WHERE id = ?', args: [FACET_BEFORE, searchId] });
  facetMock.mockReset();
  refreshBase.mockClear();
  logWarn.mockClear();
});

const facetOf = async () =>
  (await dbGet<{ category_facet: string | null }>('SELECT category_facet FROM searches WHERE id = ?', [searchId]))
    ?.category_facet;

describe('refreshCategoryFacet', () => {
  it('facet не отримано (null) → category_facet без змін, без винятку', async () => {
    facetMock.mockResolvedValueOnce(null);
    await expect(refreshCategoryFacet(searchId, 'iphone')).resolves.toBeUndefined();
    expect(await facetOf()).toBe(FACET_BEFORE);
  });

  it('виняток під час оновлення → category_facet без змін, лише запис у журнал', async () => {
    facetMock.mockRejectedValueOnce(new Error('boom'));
    await expect(refreshCategoryFacet(searchId, 'iphone')).resolves.toBeUndefined();
    expect(await facetOf()).toBe(FACET_BEFORE);
    expect(logWarn).toHaveBeenCalledWith('scanner', 'category-facet', 'boom', { searchId });
  });
});

describe('finalizeScanResult — автокатегорія', () => {
  const finalize = (search: SearchConfig) =>
    finalizeScanResult({
      searchId,
      runId: 0,
      search,
      raw: [],
      rawTotal: 0,
      requestsUsed: 1,
      usedGraphql: false,
      exhausted: false,
      partial: false,
      aborted: false,
      notes: [],
      missThreshold: 2,
      skipCategoryRefresh: true,
    });
  const config = (baseCategoryId: number | null): SearchConfig => ({
    id: searchId,
    name: 'test',
    query: 'iphone 13',
    apiFilters: {},
    baseCategoryId,
  });

  it('без нових оголошень і з уже визначеною автокатегорією — перерахунок пропущено', async () => {
    await finalize(config(80));
    expect(refreshBase).not.toHaveBeenCalled();
  });

  it('автокатегорії ще немає — перераховується навіть без нових оголошень', async () => {
    await finalize(config(null));
    expect(refreshBase).toHaveBeenCalledWith(searchId);
  });
});
