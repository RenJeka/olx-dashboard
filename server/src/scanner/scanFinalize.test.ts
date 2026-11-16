import { beforeEach, describe, expect, it, vi } from 'vitest';
import { db, dbGet } from '../db/db.js';
import { createSearch, insertListing, resetDb } from '../test/db.js';
import type { SearchConfig } from '../types.js';

// Хвіст скану: facet категорій і автокатегорія — best-effort; мережі немає (facet замокано). Автокатегорію рахує
// справжній categories/tree на тимчасовій БД — перевіряємо результат у searches.base_category_id.
const logWarn = vi.hoisted(() => vi.fn());
vi.mock('../logger.js', () => ({ logWarn, logError: vi.fn() }));
const facetMock = vi.hoisted(() => vi.fn());
vi.mock('../scraper/graphql/categories.js', () => ({ fetchCategoryFacet: facetMock }));

import { finalizeScanResult, refreshCategoryFacet } from './scanFinalize.js';

const FACET_BEFORE = JSON.stringify([{ id: 37, path: ['Електроніка'], olxCount: 5 }]);
let searchId: number;

beforeEach(async () => {
  await resetDb();
  searchId = await createSearch();
  await db.execute({ sql: 'UPDATE searches SET category_facet = ? WHERE id = ?', args: [FACET_BEFORE, searchId] });
  facetMock.mockReset();
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

  /** Категорія єдиного оголошення пошуку: перерахунок, якщо відбувся, запише саме її. */
  const LISTING_CATEGORY = 37;
  const baseCategoryOf = async () =>
    (await dbGet<{ base_category_id: number | null }>('SELECT base_category_id FROM searches WHERE id = ?', [searchId]))
      ?.base_category_id;
  beforeEach(() => insertListing(searchId, 1, { category_id: LISTING_CATEGORY }));

  it('без нових оголошень і з уже визначеною автокатегорією — перерахунок пропущено', async () => {
    await finalize(config(80));
    expect(await baseCategoryOf()).toBeNull();
  });

  it('автокатегорії ще немає — перераховується навіть без нових оголошень', async () => {
    await finalize(config(null));
    expect(await baseCategoryOf()).toBe(LISTING_CATEGORY);
  });
});
