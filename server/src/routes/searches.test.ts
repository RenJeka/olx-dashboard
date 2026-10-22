import type { FastifyInstance } from 'fastify';
import { testApp } from '../test/app.js';
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
  app = testApp();
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

// ── Характеризаційні тести (docs/plans/refactor-clean-architecture.md, фаза 0): фіксують поточну поведінку ──

interface SearchRow {
  id: number;
  name: string;
  query: string;
  sort_order: number | null;
  api_filters: string;
  local_filters: string;
  query_synonyms: string;
  archived: number;
  project_id: number | null;
}

async function addSearch(name: string, fields: Record<string, number | string | null> = {}): Promise<number> {
  const cols = ['name', 'query', ...Object.keys(fields)];
  const res = await db.execute({
    sql: `INSERT INTO searches (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`,
    args: [name, name, ...Object.values(fields)],
  });
  return Number(res.lastInsertRowid);
}

async function addScanRun(fields: Record<string, number | string | null>): Promise<void> {
  const cols = ['search_id', ...Object.keys(fields)];
  await db.execute({
    sql: `INSERT INTO scan_runs (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`,
    args: [searchId, ...Object.values(fields)],
  });
}

const sortOrder = async (id: number) =>
  (await dbGet<{ sort_order: number }>('SELECT sort_order FROM searches WHERE id = ?', [id]))?.sort_order;

describe('GET /api/searches, /api/searches/:id', () => {
  it('список за sort_order (NULL — першим); невідомий пошук → 404', async () => {
    await addSearch('b', { sort_order: 2 });
    await addSearch('a', { sort_order: 1 });
    const list = (await app.inject({ url: '/api/searches' })).json() as SearchRow[];
    expect(list.map((s) => s.name)).toEqual(['test', 'a', 'b']);

    const one = await app.inject({ url: `/api/searches/${searchId}` });
    expect((one.json() as SearchRow).id).toBe(searchId);
    const missing = await app.inject({ url: '/api/searches/999' });
    expect(missing.statusCode).toBe(404);
    expect(missing.json()).toEqual({ error: 'Пошук не знайдено' });
  });
});

describe('POST /api/searches', () => {
  it('без name/query → 400', async () => {
    const res = await app.inject({ method: 'POST', url: '/api/searches', payload: { name: 'x' } });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toEqual({ error: 'Поля name і query обовʼязкові' });
  });

  it('201; новий згори; JSON-поля — рядками; синоніми за замовчуванням []', async () => {
    await addSearch('old', { sort_order: 5 });
    const res = await app.inject({
      method: 'POST',
      url: '/api/searches',
      payload: { name: 'new', query: 'q', api_filters: { a: 1 }, local_filters: '{"b":2}', archived: 1 },
    });
    expect(res.statusCode).toBe(201);
    const row = res.json() as SearchRow;
    expect(row.sort_order).toBe(4);
    expect(row.api_filters).toBe('{"a":1}');
    expect(row.local_filters).toBe('{"b":2}');
    expect(row.query_synonyms).toBe('[]');
    expect(row.archived).toBe(1);
    expect(row.project_id).toBeNull();
  });
});

describe('PATCH /api/searches/:id — поля', () => {
  it('невідомий → 404', async () => {
    const res = await app.inject({ method: 'PATCH', url: '/api/searches/999', payload: { name: 'x' } });
    expect(res.statusCode).toBe(404);
  });

  it('оновлює лише передані поля; archived → 0/1; без local_filters — без filtered_out_count', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: `/api/searches/${searchId}`,
      payload: { query: 'q2', query_synonyms: ['a', 'b'], archived: true, project_id: null },
    });
    const row = res.json() as SearchRow & { filtered_out_count?: number };
    expect(row.name).toBe('test');
    expect(row.query).toBe('q2');
    expect(row.query_synonyms).toBe('["a","b"]');
    expect(row.archived).toBe(1);
    expect(row.filtered_out_count).toBeUndefined();
  });

  it('local_filters → filtered_out_count у відповіді', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: `/api/searches/${searchId}`,
      payload: { local_filters: { categories: [80] } },
    });
    expect((res.json() as { filtered_out_count: number }).filtered_out_count).toBe(9);
  });
});

describe('DELETE /api/searches/:id', () => {
  it('каскад: scan_runs і listings пошуку видалено, інші лишились', async () => {
    const other = await addSearch('other');
    await db.execute({ sql: 'INSERT INTO listings (olx_id, search_id, title) VALUES (?, ?, ?)', args: [999, other, 'x'] });
    await addScanRun({ kind: 'normal' });

    const res = await app.inject({ method: 'DELETE', url: `/api/searches/${searchId}` });
    expect(res.json()).toEqual({ deleted: true });
    expect(await dbGet('SELECT COUNT(*) AS n FROM listings')).toEqual({ n: 1 });
    expect(await dbGet('SELECT COUNT(*) AS n FROM scan_runs')).toEqual({ n: 0 });
    expect(await dbGet('SELECT id FROM searches WHERE id = ?', [searchId])).toBeUndefined();
  });

  it('невідомий → 404', async () => {
    expect((await app.inject({ method: 'DELETE', url: '/api/searches/999' })).statusCode).toBe(404);
  });
});

describe('POST /api/searches/:id/move', () => {
  it('лише серед неархівних у тому ж проєкті', async () => {
    await db.execute("INSERT INTO projects (id, name, sort_order) VALUES (1, 'P', 0)");
    await db.execute({ sql: 'UPDATE searches SET sort_order = 10 WHERE id = ?', args: [searchId] });
    const inProject = await addSearch('p', { sort_order: 1, project_id: 1 });
    const archived = await addSearch('arch', { sort_order: 2, archived: 1 });
    const neighbor = await addSearch('n', { sort_order: 3 });

    const res = await app.inject({ method: 'POST', url: `/api/searches/${searchId}/move`, payload: { direction: 'up' } });
    expect((res.json() as SearchRow).sort_order).toBe(3);
    expect(await sortOrder(neighbor)).toBe(10);
    expect(await sortOrder(archived)).toBe(2);
    expect(await sortOrder(inProject)).toBe(1);
  });

  it('невалідний напрям → 400; невідомий → 404', async () => {
    const bad = await app.inject({ method: 'POST', url: `/api/searches/${searchId}/move`, payload: { direction: 'x' } });
    expect(bad.statusCode).toBe(400);
    const missing = await app.inject({ method: 'POST', url: '/api/searches/999/move', payload: { direction: 'up' } });
    expect(missing.statusCode).toBe(404);
  });
});

describe('скан-маршрути без звернення до OLX', () => {
  it('run-plan без planToken → 400; stop без активного скану → stopped: false; verify невідомого → 404', async () => {
    const noToken = await app.inject({ method: 'POST', url: `/api/searches/${searchId}/scan/run-plan`, payload: {} });
    expect(noToken.statusCode).toBe(400);
    expect(noToken.json()).toEqual({ error: 'planToken обовʼязковий' });

    const stop = await app.inject({ method: 'POST', url: `/api/searches/${searchId}/scan/stop` });
    expect(stop.json()).toEqual({ stopped: false });

    const verify = await app.inject({ method: 'POST', url: '/api/searches/999/verify' });
    expect(verify.statusCode).toBe(404);
  });

  it('run-plan з невідомим токеном і без свіжого аналізу → 410', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/api/searches/${searchId}/scan/run-plan`,
      payload: { planToken: 'nope' },
    });
    expect(res.statusCode).toBe(410);
    expect(res.json()).toEqual({ error: 'План застарів або не знайдено — повторіть аналіз' });
  });
});

describe('GET /api/searches/:id/scan-status', () => {
  it('сканів нема → 404; інакше — останній запуск', async () => {
    expect((await app.inject({ url: `/api/searches/${searchId}/scan-status` })).statusCode).toBe(404);
    await addScanRun({ kind: 'normal', found: 1 });
    await addScanRun({ kind: 'deep', found: 2, stage: 'x' });
    const res = await app.inject({ url: `/api/searches/${searchId}/scan-status` });
    expect(res.json()).toMatchObject({ found: 2, stage: 'x' });
  });
});

describe('GET /api/searches/:id/last-analysis', () => {
  it('нема → 404; пошкоджений JSON → 404', async () => {
    const none = await app.inject({ url: `/api/searches/${searchId}/last-analysis` });
    expect(none.json()).toEqual({ error: 'Аналізів ще не було' });
    await addScanRun({ kind: 'analyze', scan_plan: '{bad', finished_at: new Date().toISOString() });
    const bad = await app.inject({ url: `/api/searches/${searchId}/last-analysis` });
    expect(bad.statusCode).toBe(404);
    expect(bad.json()).toEqual({ error: 'Збережений аналіз пошкоджено' });
  });

  it('свіжий → planValid: true; старий → false', async () => {
    const fresh = new Date().toISOString();
    await addScanRun({ kind: 'analyze', scan_plan: '{"planToken":"t"}', finished_at: fresh });
    const res = await app.inject({ url: `/api/searches/${searchId}/last-analysis` });
    expect(res.json()).toEqual({ plan: { planToken: 't' }, analyzedAt: fresh, planValid: true });

    await addScanRun({ kind: 'analyze', scan_plan: '{}', finished_at: '2020-01-01T00:00:00.000Z' });
    const old = await app.inject({ url: `/api/searches/${searchId}/last-analysis` });
    expect((old.json() as { planValid: boolean }).planValid).toBe(false);
  });
});

describe('GET /api/searches/:id/param-keys', () => {
  it('ключі за абеткою, до 3 різних прикладів; битий JSON пропускається', async () => {
    const rows = ['{"b":"1","a":"x"}', '{"b":"2"}', '{"b":"2"}', '{"b":"3"}', '{"b":"4"}', '{bad'];
    for (const [i, params] of rows.entries()) {
      await db.execute({ sql: 'UPDATE listings SET params = ? WHERE olx_id = ?', args: [params, 100 + i] });
    }
    const res = await app.inject({ url: `/api/searches/${searchId}/param-keys` });
    expect(res.json()).toEqual([
      { key: 'a', samples: ['x'] },
      { key: 'b', samples: ['1', '2', '3'] },
    ]);
  });
});

describe('GET /api/searches/:id/filter-options', () => {
  it('міста, продавці, плюси, мінуси — унікальні за абеткою; категорії з facet', async () => {
    await db.execute({
      sql: 'UPDATE listings SET city = ?, seller_name = ?, pros = ?, cons = ? WHERE olx_id = 100',
      args: ['Львів', 'Б', '• камера\n• екран', '• подряпини'],
    });
    await db.execute({
      sql: 'UPDATE listings SET city = ?, seller_name = ?, pros = ? WHERE olx_id = 101',
      args: ['Київ', 'А', '• камера'],
    });
    await db.execute({
      sql: 'UPDATE searches SET category_facet = ? WHERE id = ?',
      args: ['[{"id":80,"name":"Телефони","count":5}]', searchId],
    });
    const res = await app.inject({ url: `/api/searches/${searchId}/filter-options` });
    expect(res.json()).toEqual({
      cities: ['Київ', 'Львів'],
      sellers: ['А', 'Б'],
      pros: ['екран', 'камера'],
      cons: ['подряпини'],
      categories: [{ id: 80, name: 'Телефони', count: 5 }],
    });
  });

  it('битий facet → categories: []', async () => {
    await db.execute({ sql: 'UPDATE searches SET category_facet = ? WHERE id = ?', args: ['{bad', searchId] });
    const res = await app.inject({ url: `/api/searches/${searchId}/filter-options` });
    expect((res.json() as { categories: unknown[] }).categories).toEqual([]);
  });
});

describe('GET /api/searches/:id/stats', () => {
  it('невідомий → 404; нема сканів → null; analyze не враховується', async () => {
    expect((await app.inject({ url: '/api/searches/999/stats' })).statusCode).toBe(404);
    expect((await app.inject({ url: `/api/searches/${searchId}/stats` })).json()).toEqual({ last_scan: null });

    await addScanRun({ kind: 'normal', found: 7, started_at: 's' });
    await addScanRun({ kind: 'analyze', found: 0 });
    const res = await app.inject({ url: `/api/searches/${searchId}/stats` });
    expect(res.json()).toMatchObject({ last_scan: { kind: 'normal', found: 7, started_at: 's' } });
  });
});
