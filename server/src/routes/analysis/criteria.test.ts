import Fastify, { type FastifyInstance } from 'fastify';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { db, dbAll, dbGet } from '../../db/db.js';
import { createSearch, insertListing, resetDb } from '../../test/db.js';
import { criteriaRoutes } from './criteria.js';

// Категорії критеріїв (docs/plans/old/criteria-categories.md): GET/PUT і remap на тимчасовій БД.
// Автогрупування (docs/plans/old/criteria-auto-group.md): chat замокано — мережі немає, відповідь LLM задає тест.
const chatMock = vi.hoisted(() => vi.fn<(...args: unknown[]) => Promise<string>>());
vi.mock('../../analysis/openrouter.js', () => ({ chat: chatMock }));
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

describe('POST /criteria/remap — merges (автогрупування)', () => {
  it('дві групи в одному запиті: обидві категорії в списку, пункти оголошень перейменовано', async () => {
    await db.execute({
      sql: 'UPDATE searches SET analysis_criteria = ? WHERE id = ?',
      args: [JSON.stringify({ cons: ['тріснутий екран', 'зламаний екран', 'без торгу', 'торг відсутній', 'засвіт'], pros: [] }), searchId],
    });
    await setListing(1, '• тріснутий екран\n• без торгу');
    await setListing(2, '• торг відсутній\n• засвіт');
    await setListing(3, '• засвіт');

    const res = await remap({
      mode: 'cons',
      merges: [
        { from: ['тріснутий екран', 'зламаний екран'], to: 'дефект екрану' },
        { from: ['без торгу', 'торг відсутній'], to: 'без торгу' },
      ],
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ updated: 2 });
    expect((await consOf()).map((r) => r.cons)).toEqual([
      '• дефект екрану\n• без торгу',
      '• без торгу\n• засвіт',
      '• засвіт',
    ]);
    expect(JSON.parse((await searchRow())!.analysis_criteria).cons).toEqual([
      { name: 'дефект екрану', aliases: ['тріснутий екран', 'зламаний екран'], enabled: true },
      { name: 'без торгу', aliases: ['торг відсутній'], enabled: true },
      { name: 'засвіт', aliases: [], enabled: true },
    ]);
  });

  it('помилки: порожній список, група без from, порожня назва', async () => {
    expect((await remap({ mode: 'cons', merges: [] })).statusCode).toBe(400);
    expect((await remap({ mode: 'cons', merges: [{ from: [], to: 'x' }] })).statusCode).toBe(400);
    expect((await remap({ mode: 'cons', merges: [{ from: ['без торгу'], to: ' ' }] })).statusCode).toBe(400);
  });
});

describe('POST /criteria/group-suggest', () => {
  const suggest = (payload: object) =>
    app.inject({ method: 'POST', url: `/api/searches/${searchId}/criteria/group-suggest`, payload });
  const savedKey = process.env.OPENROUTER_API_KEY;
  beforeEach(() => {
    process.env.OPENROUTER_API_KEY = 'test-key';
    chatMock.mockReset();
  });
  afterEach(() => {
    if (savedKey === undefined) delete process.env.OPENROUTER_API_KEY;
    else process.env.OPENROUTER_API_KEY = savedKey;
  });

  it('пропозиції LLM проходять перевірки; критерії режиму — у промпті', async () => {
    chatMock.mockResolvedValue(
      JSON.stringify({ groups: [{ name: 'дефект екрану', members: ['Тріснутий екран', 'зламаний екран', 'вигадка'] }] }),
    );
    const res = await suggest({ mode: 'cons' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ groups: [{ name: 'дефект екрану', members: ['тріснутий екран', 'зламаний екран'] }] });
    const [messages] = chatMock.mock.calls[0] as [{ content: string }[]];
    expect(messages[0]?.content).toContain('- без торгу');
  });

  it('< 2 критеріїв — без виклику LLM; без ключа — 409; невідомий режим — 400', async () => {
    expect((await suggest({ mode: 'pros' })).json()).toEqual({ groups: [] });
    expect(chatMock).not.toHaveBeenCalled();
    expect((await suggest({ mode: 'other' })).statusCode).toBe(400);
    delete process.env.OPENROUTER_API_KEY;
    expect((await suggest({ mode: 'cons' })).statusCode).toBe(409);
  });
});
