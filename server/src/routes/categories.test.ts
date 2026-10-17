import Fastify from 'fastify';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { db, dbGet } from '../db/db.js';
import { resetDb } from '../test/db.js';

vi.mock('../logger.js', () => ({ logWarn: vi.fn(), logError: vi.fn() }));
const collect = vi.hoisted(() => vi.fn());
vi.mock('../categories/collector.js', () => ({ collectCategories: collect }));

import { categoriesRoutes } from './categories.js';

describe('POST /api/categories/collect', () => {
  it('повертає результат; паралельний виклик → 409; після завершення прапорець знято', async () => {
    const app = Fastify();
    await app.register(categoriesRoutes);

    let release!: (v: { requested: number; changed: number; failed: string[] }) => void;
    collect.mockReturnValueOnce(new Promise((r) => (release = r)));
    const first = app.inject({ method: 'POST', url: '/api/categories/collect' });
    await vi.waitFor(() => expect(collect).toHaveBeenCalledTimes(1));

    const second = await app.inject({ method: 'POST', url: '/api/categories/collect' });
    expect(second.statusCode).toBe(409);
    expect(second.json().error).toContain('уже йде');

    release({ requested: 2, changed: 5, failed: ['x'] });
    const res = await first;
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ requested: 2, changed: 5, failed: ['x'] });

    collect.mockResolvedValueOnce({ requested: 1, changed: 0, failed: [] });
    expect((await app.inject({ method: 'POST', url: '/api/categories/collect' })).statusCode).toBe(200);
    await app.close();
  });
});

describe('базові набори категорій', () => {
  const NAMES = (groups: Array<{ name: string }>) => groups.map((g) => g.name);
  let app: ReturnType<typeof Fastify>;

  beforeEach(async () => {
    await resetDb();
    await db.batch(
      [
        `INSERT INTO olx_categories (id, parent_id, label, slug) VALUES (37, NULL, 'Електроніка', 'elektronika')`,
        `INSERT INTO olx_categories (id, parent_id, label, slug) VALUES (1502, 37, 'Ноутбуки та аксесуари', 'na')`,
        `INSERT INTO olx_categories (id, parent_id, label, slug) VALUES (80, 1502, 'Ноутбуки', 'noutbuki')`,
        `INSERT INTO base_criteria (category_id, criteria) VALUES (37, '{"cons":["не працює"],"pros":[]}')`,
        `INSERT INTO base_criteria (category_id, criteria) VALUES (1502, '{"cons":[],"pros":[]}')`,
        `INSERT INTO base_criteria (category_id, criteria) VALUES (80, '{"cons":["розбитий екран"],"pros":["коробка"]}')`,
      ],
      'write',
    );
    app = Fastify();
    await app.register(categoriesRoutes);
  });
  afterEach(() => app.close());

  it('GET /api/categories — вузли дерева з hasSet', async () => {
    const res = await app.inject('/api/categories');
    expect(res.statusCode).toBe(200);
    const byId = new Map(res.json().map((n: { id: number }) => [n.id, n]));
    expect(byId.get(37)).toEqual({ id: 37, parentId: null, label: 'Електроніка', slug: 'elektronika', hasSet: true });
    expect(byId.get(1502)).toMatchObject({ parentId: 37, hasSet: false });
    expect(byId.get(80)).toMatchObject({ parentId: 1502, hasSet: true });
  });

  it('GET /api/categories/:id/criteria — own і inherited від предків з base', async () => {
    const body = (await app.inject('/api/categories/80/criteria')).json();
    expect(NAMES(body.own.cons)).toEqual(['розбитий екран']);
    expect(body.own.cons[0].base).toBeUndefined();
    expect(body.inherited.cons).toEqual([
      { name: 'не працює', aliases: [], enabled: true, base: { categoryId: 37, label: 'Електроніка' } },
    ]);
    expect(body.inherited.pros).toEqual([]);
    expect((await app.inject('/api/categories/999/criteria')).statusCode).toBe(404);
  });

  it('PUT /api/categories/:id/criteria — upsert набору, відсутній режим лишається, base не пишеться', async () => {
    const put = await app.inject({
      method: 'PUT',
      url: '/api/categories/1502/criteria',
      payload: {
        cons: [
          { name: 'не працює', aliases: [], enabled: true, base: { categoryId: 37, label: 'Електроніка' } },
          { name: 'немає зарядки', aliases: ['без зарядного'], enabled: true },
        ],
      },
    });
    expect(put.statusCode).toBe(200);
    const row = await dbGet<{ criteria: string; updated_at: string | null }>(
      'SELECT criteria, updated_at FROM base_criteria WHERE category_id = 1502',
    );
    expect(JSON.parse(row!.criteria)).toEqual({
      cons: [{ name: 'немає зарядки', aliases: ['без зарядного'], enabled: true }],
      pros: [],
    });
    expect(row!.updated_at).toBeTruthy();

    // Новий рядок (категорія без набору) + pros відсутній → порожній.
    await db.execute('DELETE FROM base_criteria WHERE category_id = 37');
    await app.inject({ method: 'PUT', url: '/api/categories/37/criteria', payload: { cons: ['не вмикається'] } });
    const fresh = await dbGet<{ criteria: string }>('SELECT criteria FROM base_criteria WHERE category_id = 37');
    expect(JSON.parse(fresh!.criteria)).toEqual({ cons: [{ name: 'не вмикається', aliases: [], enabled: true }], pros: [] });
  });

  it('PUT невідомої категорії → 404, нічого не пише', async () => {
    const res = await app.inject({ method: 'PUT', url: '/api/categories/999/criteria', payload: { cons: ['x'] } });
    expect(res.statusCode).toBe(404);
    expect(res.json().error).toBe('Категорію не знайдено');
    expect(await dbGet('SELECT 1 FROM base_criteria WHERE category_id = 999')).toBeUndefined();
  });
});
