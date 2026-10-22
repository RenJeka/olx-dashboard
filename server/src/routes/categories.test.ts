import Fastify from 'fastify';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { db, dbAll, dbGet } from '../db/db.js';
import { abortFlags } from '../scanner/abortControl.js';
import { createSearch, insertListing, resetDb } from '../test/db.js';

vi.mock('../logger.js', () => ({ logWarn: vi.fn(), logError: vi.fn() }));
const collect = vi.hoisted(() => vi.fn());
vi.mock('../categories/collector.js', () => ({ collectCategories: collect }));
// Генерація чернетки: chat замокано — жодних викликів OpenRouter, відповідь LLM задає тест.
const chatMock = vi.hoisted(() => vi.fn<(...args: unknown[]) => Promise<string>>());
vi.mock('../analysis/openrouter.js', () => ({ chat: chatMock }));

import { criteriaRoutes } from './analysis/criteria.js';
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

  it('під час скану → 409, збір не запускається', async () => {
    const app = Fastify();
    await app.register(categoriesRoutes);
    collect.mockClear();
    abortFlags.set(12345, false); // так позначає активний скан withScanRun
    try {
      const res = await app.inject({ method: 'POST', url: '/api/categories/collect' });
      expect(res.statusCode).toBe(409);
      expect(res.json().error).toBe('Іде скан — зберіть дерево після нього');
      expect(collect).not.toHaveBeenCalled();
    } finally {
      abortFlags.delete(12345);
      await app.close();
    }
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

describe('POST /api/categories/:id/criteria/generate', () => {
  let app: ReturnType<typeof Fastify>;
  const generate = (id: number, payload: object) =>
    app.inject({ method: 'POST', url: `/api/categories/${id}/criteria/generate`, payload });
  const reply = (items: string[]) => JSON.stringify({ criteria: items });
  const promptOf = (call: number) => (chatMock.mock.calls[call]![0] as Array<{ content: string }>)[0]!.content;

  beforeEach(async () => {
    await resetDb();
    chatMock.mockReset();
    vi.stubEnv('OPENROUTER_API_KEY', 'test-key');
    await db.batch(
      [
        `INSERT INTO olx_categories (id, parent_id, label, slug) VALUES (37, NULL, 'Електроніка', 'elektronika')`,
        `INSERT INTO olx_categories (id, parent_id, label, slug) VALUES (1502, 37, 'Ноутбуки та аксесуари', 'na')`,
        `INSERT INTO olx_categories (id, parent_id, label, slug) VALUES (80, 1502, 'Ноутбуки', 'noutbuki')`,
        `INSERT INTO base_criteria (category_id, criteria) VALUES (37, '{"cons":[{"name":"не працює","aliases":["не вмикається"],"enabled":true}],"pros":[]}')`,
        `INSERT INTO base_criteria (category_id, criteria) VALUES (80, '{"cons":["розбитий екран"],"pros":["коробка"]}')`,
      ],
      'write',
    );
    app = Fastify();
    await app.register(categoriesRoutes);
  });
  afterEach(async () => {
    vi.unstubAllEnvs();
    await app.close();
  });

  it('промпт: шлях, власні й успадковані як «вже є», протилежний режим як «НЕ включай»; без описів оголошень', async () => {
    const searchId = await createSearch();
    await db.execute({ sql: 'UPDATE searches SET base_category_id = 80 WHERE id = ?', args: [searchId] });
    await insertListing(searchId, 1);
    await db.execute({ sql: "UPDATE listings SET description = 'СЕКРЕТНИЙ ОПИС' WHERE olx_id = 1" });
    chatMock.mockResolvedValue(reply(['нова ознака']));

    const res = await generate(80, { mode: 'cons', model: 'test/model' });
    expect(res.statusCode).toBe(200);
    expect((chatMock.mock.calls[0]![1] as { model: string }).model).toBe('test/model');
    const prompt = promptOf(0);
    expect(prompt).toContain('Електроніка → Ноутбуки та аксесуари → Ноутбуки');
    expect(prompt).toContain('- розбитий екран');
    expect(prompt).toContain('- не працює (сюди ж: не вмикається)');
    expect(prompt).toContain('НЕ включай їх');
    expect(prompt).toContain('- коробка');
    expect(prompt).not.toContain('СЕКРЕТНИЙ ОПИС');
  });

  it('9 пунктів → не більше BASE_CRITERIA_DRAFT; нічого не зберігає', async () => {
    const before = await dbAll('SELECT category_id, criteria FROM base_criteria ORDER BY category_id');
    chatMock.mockResolvedValue(reply(['п1', 'п2', 'п3', 'п4', 'п5', 'п6', 'п7', 'п8', 'п9']));
    const res = await generate(80, { mode: 'cons' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ criteria: ['п1', 'п2', 'п3', 'п4', 'п5', 'п6', 'п7'] });
    expect(await dbAll('SELECT category_id, criteria FROM base_criteria ORDER BY category_id')).toEqual(before);
  });

  it('наявні на початку відповіді не скорочують чернетку: обрізання — після фільтра', async () => {
    const fresh = ['п1', 'п2', 'п3', 'п4', 'п5', 'п6', 'п7', 'п8'];
    chatMock.mockResolvedValue(reply(['Не працює', 'не вмикається', 'розбитий екран', 'Коробка', ...fresh]));
    const res = await generate(80, { mode: 'cons' });
    expect(res.json()).toEqual({ criteria: fresh.slice(0, 7) });
  });

  it('відсіює наявні (власні, успадковані, синоніми) і пункти протилежного режиму', async () => {
    chatMock.mockResolvedValue(reply(['Не працює', 'не вмикається', 'розбитий екран', 'Коробка', 'немає зарядки']));
    const res = await generate(80, { mode: 'cons' });
    expect(res.json()).toEqual({ criteria: ['немає зарядки'] });
  });

  it('категорія без власного набору: успадковане протилежного режиму йде в «НЕ включай»', async () => {
    chatMock.mockResolvedValue(reply(['щось']));
    const res = await generate(1502, { mode: 'pros' });
    expect(res.json()).toEqual({ criteria: ['щось'] });
    expect(promptOf(0)).toContain('- не працює (сюди ж: не вмикається)');
    expect(promptOf(0)).not.toContain('вже є');
  });

  it('невідома категорія → 404; невалідний режим → 400; без ключа → 409; помилка LLM → 502', async () => {
    const missing = await generate(999, { mode: 'cons' });
    expect(missing.statusCode).toBe(404);
    expect(missing.json().error).toBe('Категорію не знайдено');
    expect((await generate(80, { mode: 'bad' })).statusCode).toBe(400);

    vi.stubEnv('OPENROUTER_API_KEY', '');
    expect((await generate(80, { mode: 'cons' })).statusCode).toBe(409);
    expect(chatMock).not.toHaveBeenCalled();

    vi.stubEnv('OPENROUTER_API_KEY', 'test-key');
    chatMock.mockRejectedValue(new Error('OpenRouter 500'));
    const failed = await generate(80, { mode: 'cons' });
    expect(failed.statusCode).toBe(502);
    expect(failed.json().error).toBe('OpenRouter 500');
  });
});

describe('remap категорії й поглинутий власний пункт пошуку (вимкнений базовий)', () => {
  let app: ReturnType<typeof Fastify>;
  let searchId: number;
  type Item = { name: string; aliases: string[]; enabled: boolean; base?: { categoryId: number } };

  const effective = async () => (await app.inject(`/api/searches/${searchId}/criteria`)).json() as { cons: Item[] };
  const ownCons = async () => {
    const row = await dbGet<{ analysis_criteria: string }>('SELECT analysis_criteria FROM searches WHERE id = ?', [
      searchId,
    ]);
    return (JSON.parse(row!.analysis_criteria) as { cons: Item[] }).cons;
  };

  beforeEach(async () => {
    await resetDb();
    await db.batch(
      [
        `INSERT INTO olx_categories (id, parent_id, label, slug) VALUES (37, NULL, 'Електроніка', 'elektronika')`,
        `INSERT INTO olx_categories (id, parent_id, label, slug) VALUES (80, 37, 'Ноутбуки', 'noutbuki')`,
        `INSERT INTO base_criteria (category_id, criteria) VALUES (37, '{"cons":["тріснутий екран"],"pros":[]}')`,
      ],
      'write',
    );
    searchId = await createSearch();
    await db.execute({
      sql: 'UPDATE searches SET base_category_id = 80, analysis_criteria = ? WHERE id = ?',
      args: [JSON.stringify({ cons: ['тріснутий екран', 'без торгу'], pros: [] }), searchId],
    });
    app = Fastify();
    await app.register(categoriesRoutes);
    await app.register(criteriaRoutes);
  });
  afterEach(() => app.close());

  it('вимкнення → перейменування → видалення: власний пункт не воскресає увімкненим', async () => {
    // Людина вимикає базовий пункт у пошуку (відлуння GET з enabled: false).
    const before = await effective();
    expect(before.cons.map((g) => g.name)).toEqual(['тріснутий екран', 'без торгу']);
    const off = before.cons.map((g) => (g.base ? { ...g, enabled: false } : g));
    await app.inject({ method: 'PUT', url: `/api/searches/${searchId}/criteria`, payload: { cons: off } });
    // Прихований поглинутий власний пункт несе стан базового.
    expect(await ownCons()).toEqual([
      { name: 'без торгу', aliases: [], enabled: true },
      { name: 'тріснутий екран', aliases: [], enabled: false },
    ]);

    // Перейменування базового пункту в категорії переписує й поглинутий власний пункт пошуку.
    const renamed = await app.inject({
      method: 'POST',
      url: '/api/categories/37/criteria/remap',
      payload: { mode: 'cons', from: ['тріснутий екран'], to: 'розбитий екран' },
    });
    expect(renamed.statusCode).toBe(200);
    expect(await ownCons()).toEqual([
      { name: 'без торгу', aliases: [], enabled: true },
      { name: 'розбитий екран', aliases: ['тріснутий екран'], enabled: false },
    ]);
    const afterRename = await effective();
    expect(afterRename.cons.map((g) => [g.name, g.enabled, Boolean(g.base)])).toEqual([
      ['розбитий екран', false, true],
      ['без торгу', true, false],
    ]);

    // Видалення базового пункту: власний повертається — вимкненим, як був базовий.
    await app.inject({
      method: 'POST',
      url: '/api/categories/37/criteria/remap',
      payload: { mode: 'cons', from: ['розбитий екран'], to: null },
    });
    const afterDelete = await effective();
    expect(afterDelete.cons).toEqual([
      { name: 'без торгу', aliases: [], enabled: true },
      { name: 'розбитий екран', aliases: ['тріснутий екран'], enabled: false },
    ]);
  });
});
