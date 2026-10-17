import Fastify from 'fastify';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { db, dbAll, dbGet } from '../db/db.js';
import { createSearch, insertListing, resetDb } from '../test/db.js';

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

describe('POST /api/categories/:id/criteria/remap', () => {
  let app: ReturnType<typeof Fastify>;
  let searchA: number; // автокатегорія 80 — нащадок 1502
  let searchB: number; // автокатегорія 37 — предок 1502

  const remap = (id: number, payload: object) =>
    app.inject({ method: 'POST', url: `/api/categories/${id}/criteria/remap`, payload });
  const consOf = (searchId: number) =>
    dbAll<{ cons: string; filtered_out: number }>(
      'SELECT cons, filtered_out FROM listings WHERE search_id = ? ORDER BY olx_id',
      [searchId],
    );
  const searchRow = (id: number) =>
    dbGet<{ local_filters: string; base_disabled: string | null }>(
      'SELECT local_filters, base_disabled FROM searches WHERE id = ?',
      [id],
    );
  const ownCons = async (categoryId: number) => {
    const row = await dbGet<{ criteria: string }>('SELECT criteria FROM base_criteria WHERE category_id = ?', [
      categoryId,
    ]);
    return (JSON.parse(row!.criteria) as { cons: Array<{ name: string; aliases: string[] }> }).cons;
  };

  async function addListing(searchId: number, olxId: number, cons: string): Promise<void> {
    await insertListing(searchId, olxId);
    await db.execute({ sql: 'UPDATE listings SET cons = ? WHERE olx_id = ?', args: [cons, olxId] });
  }

  beforeEach(async () => {
    await resetDb();
    await db.batch(
      [
        `INSERT INTO olx_categories (id, parent_id, label, slug) VALUES (37, NULL, 'Електроніка', 'elektronika')`,
        `INSERT INTO olx_categories (id, parent_id, label, slug) VALUES (1502, 37, 'Ноутбуки та аксесуари', 'na')`,
        `INSERT INTO olx_categories (id, parent_id, label, slug) VALUES (80, 1502, 'Ноутбуки', 'noutbuki')`,
        `INSERT INTO base_criteria (category_id, criteria) VALUES (37, '{"cons":["не працює"],"pros":[]}')`,
        `INSERT INTO base_criteria (category_id, criteria) VALUES (1502, '{"cons":[{"name":"тріснутий екран","aliases":["побитий екран"],"enabled":true},"без зарядки"],"pros":[]}')`,
      ],
      'write',
    );
    searchA = await createSearch();
    searchB = await createSearch();
    await db.execute({ sql: 'UPDATE searches SET base_category_id = 80 WHERE id = ?', args: [searchA] });
    await db.execute({ sql: 'UPDATE searches SET base_category_id = 37 WHERE id = ?', args: [searchB] });
    await addListing(searchA, 1, '• тріснутий екран\n• без торгу');
    await addListing(searchB, 2, '• тріснутий екран');
    app = Fastify();
    await app.register(categoriesRoutes);
  });
  afterEach(() => app.close());

  it('перейменування: пошук у нащадку оновлено, у предку — ні; набір категорії оновлено', async () => {
    const res = await remap(1502, { mode: 'cons', from: ['тріснутий екран'], to: 'розбитий екран' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.updated).toBe(1);
    expect(body.searches).toBe(1);
    expect(body.criteria.cons.map((g: { name: string }) => g.name)).toEqual(['розбитий екран', 'без зарядки']);
    expect(body.criteria.cons[0].aliases).toEqual(expect.arrayContaining(['тріснутий екран', 'побитий екран']));

    expect((await consOf(searchA))[0]!.cons).toBe('• розбитий екран\n• без торгу');
    expect((await consOf(searchB))[0]!.cons).toBe('• тріснутий екран');
    expect((await ownCons(1502)).map((g) => g.name)).toEqual(['розбитий екран', 'без зарядки']);
  });

  it('синонім у from працює; base_disabled і local_filters пошуку переписуються, filtered_out перераховано', async () => {
    await db.execute({
      sql: 'UPDATE searches SET base_disabled = ?, local_filters = ? WHERE id = ?',
      args: [
        JSON.stringify({ cons: ['побитий екран', 'не працює'], pros: ['коробка'] }),
        JSON.stringify({ cons: ['тріснутий екран'] }),
        searchA,
      ],
    });
    await addListing(searchA, 3, '• без торгу');

    const res = await remap(1502, { mode: 'cons', from: ['побитий екран'], to: 'розбитий екран' });
    expect(res.statusCode).toBe(200);

    const row = await searchRow(searchA);
    expect(JSON.parse(row!.base_disabled!)).toEqual({ cons: ['розбитий екран', 'не працює'], pros: ['коробка'] });
    expect(JSON.parse(row!.local_filters)).toEqual({ cons: ['розбитий екран'] });
    // Фільтр «мінуси» лишає оголошення з пунктом, решту ховає — перераховано після перейменування.
    expect(await consOf(searchA)).toEqual([
      { cons: '• розбитий екран\n• без торгу', filtered_out: 0 },
      { cons: '• без торгу', filtered_out: 1 },
    ]);
  });

  it('пошук без збігів не пишеться: base_disabled лишається як був', async () => {
    const before = '{"cons":["не працює"],"pros":[]}';
    await db.execute({ sql: 'UPDATE searches SET base_disabled = ? WHERE id = ?', args: [before, searchA] });
    await remap(1502, { mode: 'cons', from: ['тріснутий екран'], to: 'розбитий екран' });
    expect((await searchRow(searchA))!.base_disabled).toBe(before);
  });

  it('видалення: пункт зник із набору й base_disabled, оголошення не чіпаємо', async () => {
    await db.execute({
      sql: 'UPDATE searches SET base_disabled = ? WHERE id = ?',
      args: ['{"cons":["тріснутий екран"],"pros":[]}', searchA],
    });
    const res = await remap(1502, { mode: 'cons', from: ['тріснутий екран'], to: null });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ updated: 0, searches: 0 });
    expect(res.json().criteria.cons.map((g: { name: string }) => g.name)).toEqual(['без зарядки']);
    expect(JSON.parse((await searchRow(searchA))!.base_disabled!)).toEqual({ cons: [], pros: [] });
    expect((await consOf(searchA))[0]!.cons).toBe('• тріснутий екран\n• без торгу');
  });

  it('успадкований пункт → 400, нічого не пишеться', async () => {
    const res = await remap(1502, { mode: 'cons', from: ['не працює'], to: 'не вмикається' });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toBe('Пункт успадковано від батьківської категорії — змінюйте його там');
    expect((await dbGet<{ criteria: string }>('SELECT criteria FROM base_criteria WHERE category_id = 37'))!.criteria).toBe(
      '{"cons":["не працює"],"pros":[]}',
    );
  });

  it('невідома категорія → 404; невідомий пункт, режим і порожнє тіло → 400', async () => {
    const missing = await remap(999, { mode: 'cons', from: ['x'], to: 'y' });
    expect(missing.statusCode).toBe(404);
    expect(missing.json().error).toBe('Категорію не знайдено');
    expect((await remap(1502, { mode: 'cons', from: ['немає такого'], to: 'y' })).statusCode).toBe(400);
    expect((await remap(1502, { mode: 'bad', from: ['x'], to: 'y' })).statusCode).toBe(400);
    expect((await remap(1502, { mode: 'cons', from: [], to: 'y' })).statusCode).toBe(400);
  });

  it('merges: кілька об’єднань одним проходом', async () => {
    const res = await remap(1502, {
      mode: 'cons',
      merges: [{ from: ['тріснутий екран', 'без зарядки'], to: 'дефект' }],
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().criteria.cons.map((g: { name: string }) => g.name)).toEqual(['дефект']);
    expect((await consOf(searchA))[0]!.cons).toBe('• дефект\n• без торгу');
  });
});
