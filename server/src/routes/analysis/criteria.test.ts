import Fastify, { type FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { db, dbAll, dbGet } from '../../db/db.js';
import { createSearch, insertListing, resetDb } from '../../test/db.js';
import { criteriaRoutes } from './criteria.js';

// Категорії критеріїв (docs/plans/criteria-categories.md): GET/PUT і remap на тимчасовій БД.
let app: FastifyInstance;
let searchId: number;

async function setListing(olxId: number, cons: string, pros = ''): Promise<void> {
  await insertListing(searchId, olxId);
  await db.execute({ sql: 'UPDATE listings SET cons = ?, pros = ? WHERE olx_id = ?', args: [cons, pros, olxId] });
}

const consOf = async () =>
  (await dbAll<{ olx_id: number; cons: string; filtered_out: number }>(
    'SELECT olx_id, cons, filtered_out FROM listings ORDER BY olx_id',
  ));

const searchRow = () =>
  dbGet<{ analysis_criteria: string; local_filters: string }>(
    'SELECT analysis_criteria, local_filters FROM searches WHERE id = ?',
    [searchId],
  );

const remap = (payload: object) =>
  app.inject({ method: 'POST', url: `/api/searches/${searchId}/criteria/remap`, payload });

beforeAll(async () => {
  app = Fastify();
  await app.register(criteriaRoutes);
});
afterAll(() => app.close());
beforeEach(async () => {
  await resetDb();
  searchId = await createSearch({ cons: ['тріснутий екран'] });
  await db.execute({
    sql: 'UPDATE searches SET analysis_criteria = ? WHERE id = ?',
    args: [JSON.stringify({ cons: ['тріснутий екран', 'зламаний екран', 'без торгу'], pros: ['коробка'] }), searchId],
  });
});

describe('GET/PUT /api/searches/:id/criteria', () => {
  it('старий формат читається як категорії; PUT зберігає режим цілком, інший не чіпає', async () => {
    const got = await app.inject(`/api/searches/${searchId}/criteria`);
    expect(got.json().cons[0]).toEqual({ name: 'тріснутий екран', aliases: [], enabled: true });

    const put = await app.inject({
      method: 'PUT',
      url: `/api/searches/${searchId}/criteria`,
      payload: { cons: [{ name: 'дефект екрану', aliases: ['тріснутий екран'], enabled: false }, 'без торгу'] },
    });
    expect(put.json()).toEqual({
      cons: [
        { name: 'дефект екрану', aliases: ['тріснутий екран'], enabled: false },
        { name: 'без торгу', aliases: [], enabled: true },
      ],
      pros: [{ name: 'коробка', aliases: [], enabled: true }],
    });
  });
});

describe('POST /api/searches/:id/criteria/remap', () => {
  it('об’єднання: категорія з синонімами, пункти в оголошеннях і фільтрі перейменовано, filtered_out перераховано', async () => {
    await setListing(1, '• тріснутий екран\n• без торгу');
    await setListing(2, '• зламаний екран');
    await setListing(3, '• без торгу');
    await setListing(4, '• Тріснутий екран\n• зламаний екран');

    const res = await remap({ mode: 'cons', from: ['тріснутий екран', 'зламаний екран'], to: 'дефект екрану' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ updated: 3 });

    expect(await consOf()).toEqual([
      { olx_id: 1, cons: '• дефект екрану\n• без торгу', filtered_out: 0 },
      { olx_id: 2, cons: '• дефект екрану', filtered_out: 0 },
      { olx_id: 3, cons: '• без торгу', filtered_out: 1 },
      { olx_id: 4, cons: '• дефект екрану', filtered_out: 0 },
    ]);
    const row = await searchRow();
    expect(JSON.parse(row!.analysis_criteria).cons[0]).toEqual({
      name: 'дефект екрану',
      aliases: ['тріснутий екран', 'зламаний екран'],
      enabled: true,
    });
    expect(JSON.parse(row!.local_filters)).toEqual({ cons: ['дефект екрану'] });
  });

  it('видалення без оголошень: лише зі списку; з оголошеннями — пункти прибрано', async () => {
    await setListing(1, '• без торгу\n• зламаний екран');

    await remap({ mode: 'cons', from: ['без торгу'], to: null, listings: false });
    expect((await consOf())[0]?.cons).toBe('• без торгу\n• зламаний екран');
    expect(JSON.parse((await searchRow())!.analysis_criteria).cons.map((g: { name: string }) => g.name)).toEqual([
      'тріснутий екран',
      'зламаний екран',
    ]);

    await remap({ mode: 'cons', from: ['без торгу'], to: null });
    expect((await consOf())[0]?.cons).toBe('• зламаний екран');
  });

  it('помилки: порожній from, порожня назва, невідомий режим', async () => {
    expect((await remap({ mode: 'cons', from: [], to: 'x' })).statusCode).toBe(400);
    expect((await remap({ mode: 'cons', from: ['без торгу'], to: '  ' })).statusCode).toBe(400);
    expect((await remap({ mode: 'other', from: ['без торгу'], to: 'x' })).statusCode).toBe(400);
  });
});
