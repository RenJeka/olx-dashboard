import { beforeEach, describe, expect, it, vi } from 'vitest';
import { dbAll } from '../db/db.js';
import { resetDb } from '../test/db.js';
import type { FacetCategory } from '../types.js';

vi.mock('../scraper/graphql/categories.js', () => ({ fetchCategoryFacet: vi.fn() }));
vi.mock('../logger.js', () => ({ logWarn: vi.fn(), logError: vi.fn() }));

import { fetchCategoryFacet } from '../scraper/graphql/categories.js';
import { collectCategories } from './collector.js';
import { SEED_WORDS } from './seedWords.js';

const fetchMock = vi.mocked(fetchCategoryFacet);

const FACET: FacetCategory[] = [
  { id: 37, label: 'Електроніка', url: '/elektronika/q-x/', count: 10 },
];

beforeEach(async () => {
  await resetDb();
  fetchMock.mockReset();
});

describe('collectCategories', () => {
  it('2 слова, друге → null: failed містить друге, requested 2, пауза одна (не після останнього)', async () => {
    fetchMock.mockResolvedValueOnce(FACET).mockResolvedValueOnce(null);
    const delay = vi.fn(() => 0);

    const res = await collectCategories(['ноутбук', 'ґаджет'], { delayMs: delay });

    expect(res.requested).toBe(2);
    expect(res.failed).toEqual(['ґаджет']);
    expect(res.changed).toBeGreaterThan(0);
    expect(delay).toHaveBeenCalledTimes(1);
  });

  it('виняток на слові не валить збирач: слово у failed, наступні обробляються', async () => {
    fetchMock.mockRejectedValueOnce(new Error('boom')).mockResolvedValueOnce(FACET);

    const res = await collectCategories(['a', 'b'], { delayMs: () => 0 });

    expect(res.failed).toEqual(['a']);
    expect(res.requested).toBe(2);
  });

  it('upsert по слову: збережене лишається, повторний прогін дає changed 0', async () => {
    fetchMock.mockResolvedValue(FACET);
    const first = await collectCategories(['x'], { delayMs: () => 0 });
    const second = await collectCategories(['x'], { delayMs: () => 0 });
    expect(first.changed).toBeGreaterThan(0);
    expect(second.changed).toBe(0);
    const rows = await dbAll('SELECT id FROM olx_categories');
    expect(rows.length).toBe(first.changed);
  });

  it('порожній і одинарний список без пауз', async () => {
    fetchMock.mockResolvedValue(FACET);
    const delay = vi.fn(() => 0);
    expect((await collectCategories([], { delayMs: delay })).requested).toBe(0);
    await collectCategories(['x'], { delayMs: delay });
    expect(delay).not.toHaveBeenCalled();
  });
});

describe('SEED_WORDS', () => {
  it('непорожній, без дублів і порожніх слів', () => {
    expect(SEED_WORDS.length).toBeGreaterThan(0);
    expect(new Set(SEED_WORDS).size).toBe(SEED_WORDS.length);
    expect(SEED_WORDS.every((w) => w.trim().length > 0)).toBe(true);
  });
});
