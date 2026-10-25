import { beforeEach, describe, expect, it, vi } from 'vitest';
import { db, dbGet } from '../db/db.js';
import { createSearch, getListing, gqlListing, insertListing, resetDb } from '../test/db.js';
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

describe('finalizeScanResult — повне покриття split/синонімів', () => {
  // docs/plans/verify-graphql.md: частковий для вікна покриття скан із priceCoverage рахує промахи з порогом 2.
  const search: SearchConfig = { id: 0, name: 'test', query: 'iphone 13', apiFilters: {}, baseCategoryId: 80 };
  const finalize = (overrides: Partial<Parameters<typeof finalizeScanResult>[0]>) =>
    finalizeScanResult({
      searchId,
      runId: 0,
      search: { ...search, id: searchId },
      raw: [gqlListing(1)],
      rawTotal: 1,
      requestsUsed: 1,
      usedGraphql: true,
      exhausted: true,
      partial: true,
      aborted: false,
      notes: [],
      missThreshold: 1,
      skipCategoryRefresh: true,
      ...overrides,
    });
  const coverage = { from: 0, to: 50000, includesNull: true };

  it('є priceCoverage → зниклий отримує промах, другий такий скан вимикає', async () => {
    await insertListing(searchId, 2, { price: 15000 });
    await finalize({ priceCoverage: coverage });
    expect(await getListing(2)).toMatchObject({ status: 'new', miss_count: 1 });
    const result = await finalize({ priceCoverage: coverage });
    expect(result.disabled_count).toBe(1);
    expect((await getListing(2))?.status).toBe('disabled');
  });

  it('без priceCoverage або зупинений скан — промахи не рахуються', async () => {
    await insertListing(searchId, 2, { price: 15000 });
    await finalize({});
    await finalize({ priceCoverage: coverage, aborted: true });
    expect((await getListing(2))?.miss_count).toBe(0);
  });
});
