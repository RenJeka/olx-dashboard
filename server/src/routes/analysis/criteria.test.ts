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
      category: null,
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
      JSON.stringify({
        items: [
          { criterion: 'Тріснутий екран', aspect: 'екран' },
          { criterion: 'зламаний екран', aspect: 'Екран' },
          { criterion: 'вигадка', aspect: 'екран' },
          { criterion: 'без торгу', aspect: 'ціна' },
        ],
      }),
    );
    const res = await suggest({ mode: 'cons' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ groups: [{ name: 'тріснутий екран', members: ['тріснутий екран', 'зламаний екран'] }] });
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

describe('базові плюси/мінуси категорії (docs/plans/old/base-criteria.md)', () => {
  const BASE_ONLY = 'Базовий пункт змінюється у вікні «Базові плюси й мінуси»';

  async function withBase(disabled = '{}'): Promise<void> {
    await db.batch(
      [
        `INSERT INTO olx_categories (id, parent_id, label, slug) VALUES (37, NULL, 'Електроніка', 'elektronika')`,
        `INSERT INTO olx_categories (id, parent_id, label, slug) VALUES (80, 37, 'Ноутбуки', 'noutbuki')`,
        `INSERT INTO base_criteria (category_id, criteria) VALUES (37, '{"cons":[{"name":"не працює","aliases":["не вмикається"],"enabled":true}],"pros":[]}')`,
      ],
      'write',
    );
    await db.execute({
      sql: 'UPDATE searches SET base_category_id = 80, base_disabled = ? WHERE id = ?',
      args: [disabled, searchId],
    });
  }

  it('пошук без base_category_id → лише власні, category: null', async () => {
    const res = await app.inject(`/api/searches/${searchId}/criteria`);
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.category).toBeNull();
    expect(body.cons.map((g: { name: string }) => g.name)).toEqual(['тріснутий екран', 'зламаний екран', 'без торгу']);
    expect(body.cons.some((g: { base?: unknown }) => g.base)).toBe(false);
  });

  it('GET: базові спершу (з base), вимкнений у base_disabled — enabled: false; шлях категорії', async () => {
    await withBase('{"cons":["не працює"],"pros":[]}');
    const body = (await app.inject(`/api/searches/${searchId}/criteria`)).json();
    expect(body.category).toEqual({ id: 80, path: ['Електроніка', 'Ноутбуки'] });
    expect(body.cons[0]).toEqual({
      name: 'не працює',
      aliases: ['не вмикається'],
      enabled: false,
      base: { categoryId: 37, label: 'Електроніка' },
    });
    expect(body.cons).toHaveLength(4);
  });

  it('PUT з базовими пунктами: в analysis_criteria лише власні, вимкнення — у base_disabled', async () => {
    await withBase();
    const base = { categoryId: 37, label: 'Електроніка' };
    const put = await app.inject({
      method: 'PUT',
      url: `/api/searches/${searchId}/criteria`,
      payload: { cons: [{ name: 'не працює', aliases: ['не вмикається'], enabled: false, base }, 'без торгу'] },
    });
    expect(put.statusCode).toBe(200);
    expect(put.json().cons[0]).toMatchObject({ name: 'не працює', enabled: false, base });
    const row = await dbGet<{ analysis_criteria: string; base_disabled: string }>(
      'SELECT analysis_criteria, base_disabled FROM searches WHERE id = ?',
      [searchId],
    );
    expect(JSON.parse(row!.analysis_criteria)).toEqual({
      cons: [{ name: 'без торгу', aliases: [], enabled: true }],
      pros: [{ name: 'коробка', aliases: [], enabled: true }],
    });
    expect(JSON.parse(row!.base_disabled)).toEqual({ cons: ['не працює'], pros: [] });

    // Увімкнення назад прибирає запис із base_disabled; відсутній режим (pros) не чіпається.
    await app.inject({
      method: 'PUT',
      url: `/api/searches/${searchId}/criteria`,
      payload: { cons: [{ name: 'не працює', aliases: [], enabled: true, base }] },
    });
    const after = await dbGet<{ base_disabled: string }>('SELECT base_disabled FROM searches WHERE id = ?', [searchId]);
    expect(JSON.parse(after!.base_disabled)).toEqual({ cons: [], pros: [] });
  });

  it('автокатегорії немає в olx_categories → лише власні, category: null', async () => {
    await withBase();
    await db.execute({ sql: 'UPDATE searches SET base_category_id = 999 WHERE id = ?', args: [searchId] });
    const body = (await app.inject(`/api/searches/${searchId}/criteria`)).json();
    expect(body.category).toBeNull();
    expect(body.cons.map((g: { name: string }) => g.name)).toEqual(['тріснутий екран', 'зламаний екран', 'без торгу']);
    expect(body.cons.some((g: { base?: unknown }) => g.base)).toBe(false);
  });

  it('PUT-відлуння GET: ефективний список той самий, поглинутий власний пункт лишається в analysis_criteria', async () => {
    await withBase();
    const absorbed = { name: 'Не працює', aliases: ['мертвий'], enabled: true };
    await db.execute({
      sql: 'UPDATE searches SET analysis_criteria = ? WHERE id = ?',
      args: [JSON.stringify({ cons: [absorbed, 'без торгу'], pros: ['коробка'] }), searchId],
    });
    const before = (await app.inject(`/api/searches/${searchId}/criteria`)).json();
    expect(before.cons[0]).toEqual({
      name: 'не працює',
      aliases: ['не вмикається', 'мертвий'],
      enabled: true,
      base: { categoryId: 37, label: 'Електроніка' },
    });

    const put = await app.inject({
      method: 'PUT',
      url: `/api/searches/${searchId}/criteria`,
      payload: { cons: before.cons, pros: before.pros },
    });
    expect(put.json()).toEqual(before);
    expect((await app.inject(`/api/searches/${searchId}/criteria`)).json()).toEqual(before);
    expect(JSON.parse((await searchRow())!.analysis_criteria).cons).toEqual([
      { name: 'без торгу', aliases: [], enabled: true },
      absorbed,
    ]);
  });

  it('вимкнений поглинутий власний пункт вимикає базовий; відлуння переносить це в base_disabled', async () => {
    await withBase();
    await db.execute({
      sql: 'UPDATE searches SET analysis_criteria = ? WHERE id = ?',
      args: [JSON.stringify({ cons: [{ name: 'не працює', aliases: [], enabled: false }], pros: [] }), searchId],
    });
    const before = (await app.inject(`/api/searches/${searchId}/criteria`)).json();
    expect(before.cons[0]).toMatchObject({ name: 'не працює', enabled: false, base: { categoryId: 37 } });

    await app.inject({ method: 'PUT', url: `/api/searches/${searchId}/criteria`, payload: { cons: before.cons } });
    const row = await dbGet<{ base_disabled: string }>('SELECT base_disabled FROM searches WHERE id = ?', [searchId]);
    expect(JSON.parse(row!.base_disabled)).toEqual({ cons: ['не працює'], pros: [] });
    expect((await app.inject(`/api/searches/${searchId}/criteria`)).json().cons[0].enabled).toBe(false);

    // Увімкнення базового пункту тепер працює (поглинутий власний не тримає його вимкненим).
    const on = before.cons.map((g: object) => ({ ...g, enabled: true }));
    await app.inject({ method: 'PUT', url: `/api/searches/${searchId}/criteria`, payload: { cons: on } });
    expect((await app.inject(`/api/searches/${searchId}/criteria`)).json().cons[0].enabled).toBe(true);
  });

  it('remap з базовим пунктом (назва чи синонім) у from → 400', async () => {
    await withBase();
    const res = await remap({ mode: 'cons', from: ['Не працює', 'без торгу'], to: 'x' });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toBe(BASE_ONLY);
    const viaAlias = await remap({ mode: 'cons', merges: [{ from: ['не вмикається'], to: 'y' }] });
    expect(viaAlias.statusCode).toBe(400);
    expect(viaAlias.json().error).toBe(BASE_ONLY);
    // Власні пункти — як і раніше; відповідь — ефективний список (з базовими).
    const own = await remap({ mode: 'cons', from: ['без торгу'], to: null });
    expect(own.statusCode).toBe(200);
    expect(own.json().criteria.cons.map((g: { name: string }) => g.name)).toEqual([
      'не працює',
      'тріснутий екран',
      'зламаний екран',
    ]);
    expect(own.json().criteria.cons[0].base).toEqual({ categoryId: 37, label: 'Електроніка' });
  });

  it('group-suggest: лише власні; поглинутий базовим власний пункт не пропонується', async () => {
    await withBase();
    await db.execute({
      sql: 'UPDATE searches SET analysis_criteria = ? WHERE id = ?',
      args: [JSON.stringify({ cons: ['Не працює', 'тріснутий екран', 'зламаний екран'], pros: [] }), searchId],
    });
    const savedKey = process.env.OPENROUTER_API_KEY;
    process.env.OPENROUTER_API_KEY = 'test-key';
    chatMock.mockReset();
    chatMock.mockResolvedValue(JSON.stringify({ items: [] }));
    try {
      const res = await app.inject({
        method: 'POST',
        url: `/api/searches/${searchId}/criteria/group-suggest`,
        payload: { mode: 'cons' },
      });
      expect(res.statusCode).toBe(200);
      const [messages] = chatMock.mock.calls[0] as [{ content: string }[]];
      expect(messages[0]?.content).toContain('- зламаний екран');
      expect(messages[0]?.content.toLowerCase()).not.toContain('не працює');
    } finally {
      if (savedKey === undefined) delete process.env.OPENROUTER_API_KEY;
      else process.env.OPENROUTER_API_KEY = savedKey;
    }
  });

  it('промпт генерації: базові пункти — серед «вже є»', async () => {
    await withBase();
    const res = await app.inject(`/api/searches/${searchId}/criteria/prompt?mode=cons`);
    expect(res.statusCode).toBe(200);
    expect(res.json().prompt).toContain('- не працює (сюди ж: не вмикається)');
  });
});
