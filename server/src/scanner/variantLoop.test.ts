import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { db, dbAll, dbGet } from '../db/db.js';
import { createSearch, gqlListing, resetDb } from '../test/db.js';
import type { SplitPlan } from '../scraper/graphql/types.js';
import type { FetchSearchResult, SearchConfig } from '../types.js';

// Характеризаційні тести (docs/plans/refactor-clean-architecture.md, фаза 0, крок 0.3): цикл варіантів запиту
// (синоніми) у звичайному скані (fetchAllQueries) і в глибокому за планом (runDeepScanFromPlan) — до злиття двох
// циклів у фазі 5. Мережі немає: фетчери, facet і автокатегорія замокані; паузи між варіантами — миттєві.
const logError = vi.hoisted(() => vi.fn());
vi.mock('../logger.js', () => ({ logError, logWarn: vi.fn() }));
vi.mock('../scraper/graphql/categories.js', () => ({ fetchCategoryFacet: vi.fn(async () => null) }));
vi.mock('../categories/tree.js', async (orig) => ({
  ...(await orig<typeof import('../categories/tree.js')>()),
  refreshBaseCategory: vi.fn(async () => null),
}));
vi.mock('../scraper/utils.js', async (orig) => ({
  ...(await orig<typeof import('../scraper/utils.js')>()),
  interruptibleSleep: vi.fn(async () => undefined),
}));

import { graphqlFetcher } from './fetchOrchestrator.js';
import { analyzeScan, runDeepScanFromPlan } from './analyzeScan.js';
import { runScan } from './runScan.js';

const MAIN = 'iphone 13';
const SYNONYM = 'айфон 13';
let searchId: number;

// Обидва цикли пишуть ті самі тексти — фаза 5 має їх зберегти.
const FIRST_FAILURE_ERROR = 'graphql failed: 403; html fallback вимкнено (OLX відповідає 403)';
const LATE_FAILURE_WARNING =
  `multi-query: 2 варіантів запиту змерджено; «${SYNONYM}»: збій (${FIRST_FAILURE_ERROR}) — скан завершено достроково, ` +
  'зібране попередніми варіантами збережено; вікно покриття пропущено (union кількох видач)';

const plan =(rootCount: number): SplitPlan => ({ rootCount, buckets: [], rootItems: [], requestsUsed: 1, noSplit: true });

const fetched = (ids: number[], extra: Partial<FetchSearchResult> = {}): FetchSearchResult => ({
  listings: ids.map((id) => gqlListing(id)),
  visibleTotalCount: ids.length,
  requestsUsed: 2,
  exhausted: true,
  ...extra,
});

/** Видача на варіант запиту: масив id або помилка. */
function byVariant(map: Record<string, number[] | Error>) {
  return async (search: SearchConfig) => {
    const v = map[search.query];
    if (v instanceof Error) throw v;
    return fetched(v ?? []);
  };
}

const lastRun = () =>
  dbGet<{ kind: string; found: number; raw_found: number; error: string | null; warning: string | null }>(
    'SELECT kind, found, raw_found, error, warning FROM scan_runs ORDER BY id DESC LIMIT 1',
  );
const listingIds = async () => (await dbAll<{ olx_id: number }>('SELECT olx_id FROM listings ORDER BY olx_id')).map((r) => r.olx_id);

beforeEach(async () => {
  await resetDb();
  searchId = await createSearch();
  await db.execute({ sql: 'UPDATE searches SET query_synonyms = ? WHERE id = ?', args: [JSON.stringify([SYNONYM]), searchId] });
  logError.mockClear();
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe('runScan — синоніми (fetchAllQueries)', () => {
  it('дві видачі зливаються по olxId; warning — multi-query і пропуск вікна покриття', async () => {
    vi.spyOn(graphqlFetcher, 'fetchSearch').mockImplementation(byVariant({ [MAIN]: [1, 2], [SYNONYM]: [2, 3] }));

    const result = await runScan(searchId);
    expect(result).toMatchObject({ found: 3, new_count: 3, rawFound: 4, requestsUsed: 4 });
    expect(await listingIds()).toEqual([1, 2, 3]);
    const run = await lastRun();
    expect(run).toMatchObject({ kind: 'normal', found: 3, raw_found: 4, error: null });
    expect(run?.warning).toBe('multi-query: 2 варіантів запиту змерджено; вікно покриття пропущено (union кількох видач)');
  });

  it('збій пізнього варіанта не валить скан: зібране збережено, причина — у warning і журналі', async () => {
    vi.spyOn(graphqlFetcher, 'fetchSearch').mockImplementation(byVariant({ [MAIN]: [1, 2], [SYNONYM]: new Error('403') }));

    const result = await runScan(searchId);
    expect(result).toMatchObject({ found: 2 });
    expect(await listingIds()).toEqual([1, 2]);
    expect((await lastRun())?.warning).toBe(LATE_FAILURE_WARNING);
    expect(logError.mock.calls[0]?.slice(0, 2)).toEqual(['scanner', `variant «${SYNONYM}» 2/2`]);
  });

  it('збій першого варіанта → помилка скану з причиною GraphQL', async () => {
    vi.spyOn(graphqlFetcher, 'fetchSearch').mockImplementation(byVariant({ [MAIN]: new Error('403'), [SYNONYM]: [1] }));

    await expect(runScan(searchId)).rejects.toThrow('graphql failed: 403');
    expect((await lastRun())?.error).toBe(FIRST_FAILURE_ERROR);
  });
});

describe('analyzeScan → runDeepScanFromPlan', () => {
  async function analyze(): Promise<string> {
    vi.spyOn(graphqlFetcher, 'analyzeSplit').mockResolvedValue(plan(2));
    return (await analyzeScan(searchId, { deep: true })).planToken;
  }

  it('два варіанти за планом: злиття, deep у scanFromPlan, warning як у звичайному скані', async () => {
    const token = await analyze();
    const scan = vi.spyOn(graphqlFetcher, 'scanFromPlan').mockImplementation(byVariant({ [MAIN]: [1, 2], [SYNONYM]: [2, 3] }));

    const result = await runDeepScanFromPlan(searchId, token);
    expect(result).toMatchObject({ found: 3, new_count: 3, rawFound: 4, requestsUsed: 4 });
    expect(scan.mock.calls.map((c) => [c[0].query, c[2]?.deep])).toEqual([
      [MAIN, true],
      [SYNONYM, true],
    ]);
    const run = await lastRun();
    expect(run).toMatchObject({ kind: 'deep', found: 3, error: null });
    expect(run?.warning).toBe('multi-query: 2 варіантів запиту змерджено; вікно покриття пропущено (union кількох видач)');
  });

  it('збій пізнього варіанта: зібране збережено, warning і журнал із «plan-variant»', async () => {
    const token = await analyze();
    vi.spyOn(graphqlFetcher, 'scanFromPlan').mockImplementation(byVariant({ [MAIN]: [1, 2], [SYNONYM]: new Error('403') }));

    const result = await runDeepScanFromPlan(searchId, token);
    expect(result).toMatchObject({ found: 2 });
    expect((await lastRun())?.warning).toBe(LATE_FAILURE_WARNING);
    expect(logError.mock.calls[0]?.slice(0, 2)).toEqual(['scanner', `plan-variant «${SYNONYM}» 2/2`]);
  });

  it('збій першого варіанта → помилка скану', async () => {
    const token = await analyze();
    vi.spyOn(graphqlFetcher, 'scanFromPlan').mockImplementation(byVariant({ [MAIN]: new Error('403'), [SYNONYM]: [1] }));

    await expect(runDeepScanFromPlan(searchId, token)).rejects.toThrow('graphql failed: 403');
    expect((await lastRun())?.error).toBe(FIRST_FAILURE_ERROR);
  });

  it('токен одноразовий: повтор у межах TTL → звичайний глибокий скан з нуля (fetchSearchSplit)', async () => {
    const token = await analyze();
    vi.spyOn(graphqlFetcher, 'scanFromPlan').mockImplementation(byVariant({ [MAIN]: [1], [SYNONYM]: [2] }));
    await runDeepScanFromPlan(searchId, token);

    const fetch = vi.spyOn(graphqlFetcher, 'fetchSearchSplit').mockImplementation(byVariant({ [MAIN]: [5], [SYNONYM]: [6] }));
    const again = await runDeepScanFromPlan(searchId, token);
    expect(again).toMatchObject({ found: 2 });
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('план іншого пошуку й без свіжого аналізу → «План застарів…»', async () => {
    const token = await analyze();
    const other = await createSearch();
    await expect(runDeepScanFromPlan(other, token)).rejects.toThrow('План застарів або не знайдено — повторіть аналіз');
  });
});
