import { describe, expect, it } from 'vitest';
import { coverageFromPriceFilter, coverageFromSplit, intersectCoverage } from './priceCoverage.js';
import type { SearchConfig } from '../types.js';

const search = (price?: { from?: number; to?: number }): SearchConfig => ({
  id: 1,
  name: 'test',
  query: 'iphone',
  apiFilters: price ? { ranges: { price } } : {},
});

describe('priceCoverage', () => {
  it('без цінового фільтра — уся видача, включно з оголошеннями без ціни', () => {
    expect(coverageFromPriceFilter(search())).toEqual({ from: null, to: null, includesNull: true });
  });

  it('діапазон від 0 містить оголошення без ціни, від більшої межі — ні (рішення людини 2026-10-25)', () => {
    expect(coverageFromSplit(0, 5000).includesNull).toBe(true);
    expect(coverageFromSplit(1000, 5000).includesNull).toBe(false);
    expect(coverageFromPriceFilter(search({ from: 2000 }))).toEqual({ from: 2000, to: null, includesNull: false });
  });

  it('перетин варіантів — найвужчий спільний діапазон; без ціни — лише якщо в усіх', () => {
    const a = coverageFromSplit(0, 40000);
    const b = coverageFromPriceFilter(search({ from: 1000 }));
    expect(intersectCoverage(a, b)).toEqual({ from: 1000, to: 40000, includesNull: false });
    expect(intersectCoverage(coverageFromPriceFilter(search()), a)).toEqual(a);
  });
});
