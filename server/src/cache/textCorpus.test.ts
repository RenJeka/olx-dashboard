import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { upsertListings } from '../scraper/normalizer.js';
import { searchListingIds } from '../services/listings.js';
import { createSearch, gqlListing, resetDb } from '../test/db.js';
import { keyPrefix, setCacheStoreForTests, type CacheStore } from './redis.js';
import {
  flushCacheWritesForTests,
  getCorpus,
  invalidateCorpus,
  resetCorpusCacheForTests,
  type TextCorpus,
} from './textCorpus.js';

// Кеш тексту пошуку в описі (docs/plans/redis-description-search-cache.md): L1 → L2 (Redis) → Turso.

/** Фейковий Redis у пам'яті; `fail` — кожна команда падає, `oom` — запис падає як переповнений Redis. */
function fakeStore(opts: { fail?: boolean; oom?: boolean } = {}) {
  const data = new Map<string, Buffer | number>();
  const guard = () => {
    if (opts.fail) throw new Error('connection lost');
  };
  const store: CacheStore = {
    getNumber: async (key) => (guard(), Number(data.get(key) ?? 0)),
    incr: async (key) => {
      guard();
      const next = Number(data.get(key) ?? 0) + 1;
      data.set(key, next);
      return next;
    },
    getBuffer: async (key) => (guard(), (data.get(key) as Buffer | undefined) ?? null),
    setBuffer: async (key, value) => {
      guard();
      if (opts.oom) throw new Error("OOM command not allowed when used memory > 'maxmemory'.");
      data.set(key, value);
    },
    del: async (key) => void (guard(), data.delete(key)),
    memoryUsage: async () => 100,
    info: async () => ({ usedMemory: 1000, maxmemory: 30_000_000, evictedKeys: 0 }),
    traffic: () => ({ sentBytes: 0, receivedBytes: 0 }),
  };
  return { store };
}

const CORPUS: TextCorpus = { ids: [1, 2], titles: ['iphone 13', 'iphone 12'], descriptions: ['батарея 91%', 'розбитий'] };

let searchId: number;

beforeEach(async () => {
  await resetDb();
  searchId = await createSearch();
});
afterEach(async () => {
  await flushCacheWritesForTests();
  setCacheStoreForTests(undefined);
});

describe('getCorpus', () => {
  it('без Redis: перший запит — Turso, далі L1; скидання → знову Turso', async () => {
    setCacheStoreForTests(null);
    const load = vi.fn(async () => CORPUS);

    expect((await getCorpus(searchId, load)).source).toBe('turso');
    expect((await getCorpus(searchId, load)).source).toBe('L1');
    await invalidateCorpus(searchId, 'upsert');
    expect((await getCorpus(searchId, load)).source).toBe('turso');
    expect(load).toHaveBeenCalledTimes(2);
  });

  it('з Redis: після рестарту процесу (порожній L1) корпус береться з Redis без Turso', async () => {
    const { store } = fakeStore();
    setCacheStoreForTests(store);
    const load = vi.fn(async () => CORPUS);

    await getCorpus(searchId, load);
    await flushCacheWritesForTests(); // запис у Redis — фоновий
    resetCorpusCacheForTests();
    const second = await getCorpus(searchId, load);

    expect(second.source).toBe('L2');
    expect(second.corpus).toEqual(CORPUS);
    expect(load).toHaveBeenCalledTimes(1);
  });

  it('нова версія в Redis (скан в іншому процесі) → ні L1, ні старий блок не віддаються', async () => {
    const { store } = fakeStore();
    setCacheStoreForTests(store);
    const load = vi.fn(async () => CORPUS);

    await getCorpus(searchId, load);
    await store.incr(`${keyPrefix()}corpus:${searchId}:v`);

    expect((await getCorpus(searchId, load)).source).toBe('turso');
    expect(load).toHaveBeenCalledTimes(2);
  });

  it('паралельні запити одного пошуку ділять одну побудову з Turso', async () => {
    setCacheStoreForTests(fakeStore().store);
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const load = vi.fn(async () => (await gate, CORPUS));

    const first = getCorpus(searchId, load);
    const second = getCorpus(searchId, load);
    release();

    expect((await first).source).toBe('turso');
    expect(await second).toEqual({ corpus: CORPUS, source: 'shared' });
    expect(load).toHaveBeenCalledTimes(1);
  });

  it('скидання під час побудови → новий запит не чекає на стару побудову', async () => {
    setCacheStoreForTests(null);
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const load = vi.fn(async () => (await gate, CORPUS));

    const first = getCorpus(searchId, load);
    await invalidateCorpus(searchId, 'upsert');
    const second = getCorpus(searchId, load);
    release();

    expect((await first).source).toBe('turso');
    expect((await second).source).toBe('turso');
    expect(load).toHaveBeenCalledTimes(2);
  });

  it('Redis падає на кожній команді → пошук іде через Turso, без помилки', async () => {
    setCacheStoreForTests(fakeStore({ fail: true }).store);
    const result = await getCorpus(searchId, async () => CORPUS);
    expect(result).toEqual({ corpus: CORPUS, source: 'turso' });
  });

  it('Redis переповнений (OOM) → корпус усе одно віддається і лишається в L1', async () => {
    setCacheStoreForTests(fakeStore({ oom: true }).store);
    const load = vi.fn(async () => CORPUS);

    expect((await getCorpus(searchId, load)).source).toBe('turso');
    expect((await getCorpus(searchId, load)).source).toBe('L1');
  });
});

describe('пошук в описі + upsert', () => {
  it('нові оголошення зі скану одразу шукаються (upsert скидає кеш)', async () => {
    setCacheStoreForTests(fakeStore().store);
    await upsertListings(searchId, [gqlListing(1, { description: '<p>Батарея 91%</p>' })]);
    expect((await searchListingIds(searchId, 'батарея', true, true)).ids).toHaveLength(1);

    await upsertListings(searchId, [gqlListing(2, { description: 'Нова батарея' })]);
    expect((await searchListingIds(searchId, 'батарея', true, true)).ids).toHaveLength(2);
  });
});
