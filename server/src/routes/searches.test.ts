import Fastify, { type FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { db, dbGet } from '../db/db.js';
import { createSearch, resetDb } from '../test/db.js';
import { searchesRoutes } from './searches.js';

let app: FastifyInstance;
let searchId: number;

async function insert(olxId: number, categoryId: number): Promise<void> {
  await db.execute({
    sql: 'INSERT INTO listings (olx_id, search_id, title, category_id) VALUES (?, ?, ?, ?)',
    args: [olxId, searchId, `item ${olxId}`, categoryId],
  });
}

beforeAll(async () => {
  app = Fastify();
  await app.register(searchesRoutes);
});
afterAll(() => app.close());
beforeEach(async () => {
  await resetDb();
  searchId = await createSearch();
  for (let i = 0; i < 5; i++) await insert(100 + i, 80);
  for (let i = 0; i < 9; i++) await insert(200 + i, 1506);
});

const baseCategory = async () =>
  (await dbGet<{ base_category_id: number | null }>('SELECT base_category_id FROM searches WHERE id = ?', [searchId]))
    ?.base_category_id;

describe('PATCH /api/searches/:id — автокатегорія', () => {
  it('local_filters.categories: [80] → base_category_id = 80', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: `/api/searches/${searchId}`,
      payload: { local_filters: { categories: [80] } },
    });
    expect(res.statusCode).toBe(200);
    expect(await baseCategory()).toBe(80);
  });

  it('без whitelist → домінуюча категорія', async () => {
    await app.inject({
      method: 'PATCH',
      url: `/api/searches/${searchId}`,
      payload: { local_filters: { price_range: { min: 1 } } },
    });
    expect(await baseCategory()).toBe(1506);
  });

  it('PATCH без local_filters не чіпає base_category_id', async () => {
    await app.inject({ method: 'PATCH', url: `/api/searches/${searchId}`, payload: { name: 'x' } });
    expect(await baseCategory()).toBeNull();
  });
});
