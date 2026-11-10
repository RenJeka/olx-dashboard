import type { FastifyInstance } from 'fastify';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { MAX_ANALYZE_IDS } from '../analysis/constants.js';
import { db, dbGet } from '../db/db.js';
import { testApp } from '../test/app.js';
import { createSearch, insertListing, resetDb } from '../test/db.js';
import { readZip } from '../test/zip.js';
import { analysisRoutes } from './analysis/index.js';
import { aiPicksRoutes } from './aiPicks.js';
import { relevanceRoutes } from './relevance.js';
import { searchSynonymsRoutes } from './searchSynonyms.js';

// Характеризаційні тести AI-маршрутів (docs/plans/old/refactor-general-modules.md, порція 3): коди й тексти
// помилок, склад ZIP-пакетів ручного режиму. Без LLM — авто-ендпойнти перевіряються лише до виклику моделі.
let app: FastifyInstance;
let searchId: number;
const savedKey = process.env.OPENROUTER_API_KEY;

const NOT_FOUND = { error: 'Пошук не знайдено' };
const NO_KEY = { error: 'Авто-режим недоступний: немає OPENROUTER_API_KEY' };
const EMPTY = { error: 'Порожня відповідь' };
const TOO_MANY = { error: `Максимум ${MAX_ANALYZE_IDS} id за виклик` };

const post = (url: string, payload: object = {}) => app.inject({ method: 'POST', url, payload });
const idOf = async (olxId: number) =>
  (await dbGet<{ id: number }>('SELECT id FROM listings WHERE olx_id = ?', [olxId]))!.id;
/** Оголошення зі своїм заголовком (`insertListing` ставить заголовок сам). */
async function addListing(olxId: number, title: string, description: string, price: number): Promise<void> {
  await insertListing(searchId, olxId, { description, price });
  await db.execute({ sql: 'UPDATE listings SET title = ? WHERE olx_id = ?', args: [title, olxId] });
}
const manyIds = Array.from({ length: MAX_ANALYZE_IDS + 1 }, (_, i) => i + 1);

beforeAll(async () => {
  app = testApp();
  await app.register(analysisRoutes);
  await app.register(aiPicksRoutes);
  await app.register(relevanceRoutes);
  await app.register(searchSynonymsRoutes);
});
afterAll(() => app.close());
beforeEach(async () => {
  delete process.env.OPENROUTER_API_KEY;
  await resetDb();
  searchId = await createSearch();
  await addListing(1, 'iPhone 13 128GB', 'стан ідеальний', 9000);
  await addListing(2, 'Чохол iPhone 15', 'новий чохол', 200);
});
afterEach(() => {
  if (savedKey === undefined) delete process.env.OPENROUTER_API_KEY;
  else process.env.OPENROUTER_API_KEY = savedKey;
});

describe('невідомий пошук → 404', () => {
  it.each([
    ['GET', '/relevance/target'],
    ['PUT', '/relevance/target'],
    ['POST', '/relevance/preview'],
    ['POST', '/relevance/analyze'],
    ['POST', '/relevance/package.zip'],
    ['POST', '/relevance/import'],
    ['POST', '/ai-picks/prompt'],
    ['POST', '/ai-picks/package.zip'],
    ['POST', '/ai-picks/rank'],
    ['POST', '/ai-picks/import'],
    ['POST', '/analyze'],
    ['POST', '/analyze/package.zip'],
    ['POST', '/analyze/import'],
    ['POST', '/analyze/export'],
    ['GET', '/criteria'],
    ['POST', '/criteria/generate'],
    ['POST', '/criteria/group-suggest'],
    ['GET', '/criteria/prompt'],
    ['POST', '/criteria/import'],
    ['PUT', '/criteria'],
  ] as const)('%s %s', async (method, path) => {
    const res = await app.inject({
      method,
      url: `/api/searches/999${path}`,
      ...(method === 'GET' ? {} : { payload: {} }),
    });
    expect(res.statusCode).toBe(404);
    expect(res.json()).toEqual(NOT_FOUND);
  });
});

describe('фільтр релевантності', () => {
  const url = (path: string) => `/api/searches/${searchId}/relevance/${path}`;

  it('ціль: за замовчуванням query, PUT зберігає', async () => {
    expect((await app.inject({ url: url('target') })).json()).toEqual({ target: 'iphone 13' });
    const res = await app.inject({ method: 'PUT', url: url('target'), payload: { target: '  iphone 13 pro ' } });
    expect(res.json()).toEqual({ target: 'iphone 13 pro' });
  });

  it('preview: розбивка пре-фільтра; нечислові id відкидаються', async () => {
    expect((await post(url('preview'))).json()).toEqual({ total: 2, candidates: 1, autoRejected: 1 });
    const res = await post(url('preview'), { ids: [await idOf(1), 'x'] });
    expect(res.json()).toEqual({ total: 1, candidates: 1, autoRejected: 0 });
  });

  it('analyze: без ключа — 409; забагато id — 400', async () => {
    const noKey = await post(url('analyze'));
    expect(noKey.statusCode).toBe(409);
    expect(noKey.json()).toEqual(NO_KEY);

    process.env.OPENROUTER_API_KEY = 'test-key';
    const tooMany = await post(url('analyze'), { ids: manyIds });
    expect(tooMany.statusCode).toBe(400);
    expect(tooMany.json()).toEqual(TOO_MANY);
  });

  it('package.zip: інструкція, скрипти, чанк кандидатів і порожня заготовка результату', async () => {
    const res = await post(url('package.zip'));
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toBe('application/zip');
    expect(res.headers['content-disposition']).toBe(`attachment; filename="relevance-search-${searchId}.zip"`);

    const files = readZip(res.rawPayload);
    expect([...files.keys()]).toEqual([
      'prompt.txt',
      'merge.py',
      'verify.py',
      'descriptions/chunk-001.json',
      'classifications/result-001.json',
    ]);
    expect(files.get('prompt.txt')).toContain('iphone 13');
    expect(files.get('classifications/result-001.json')).toBe('[]\n');
    const chunk = JSON.parse(files.get('descriptions/chunk-001.json') as string) as { id: number }[];
    expect(chunk.map((l) => l.id)).toEqual([await idOf(1)]);
  });

  it('import: порожньо — 400; не JSON — 400; вердикт ШІ + відсіяні евристикою + накопичене', async () => {
    const empty = await post(url('import'));
    expect(empty.statusCode).toBe(400);
    expect(empty.json()).toEqual(EMPTY);
    expect((await post(url('import'), { raw: 'не json' })).statusCode).toBe(400);

    const [first, second] = [await idOf(1), await idOf(2)];
    const res = await post(url('import'), {
      raw: JSON.stringify([{ id: first, relevant: true, reason: 'це він' }]),
      accumulated: [{ id: 777, relevant: true, reason: 'раніше' }],
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { results: { id: number; relevant: boolean }[]; errors: string[] };
    expect(body.errors).toEqual([]);
    expect(body.results.map((r) => [r.id, r.relevant])).toEqual([
      [777, true],
      [second, false],
      [first, true],
    ]);
  });
});

describe('AI Вибір', () => {
  const url = (path: string) => `/api/searches/${searchId}/ai-picks/${path}`;
  const NO_CANDIDATES = { error: 'Немає кандидатів для ранжування (додайте оголошення без мінусів)' };

  it('немає кандидатів → 400 (prompt, package.zip, rank)', async () => {
    await db.execute('UPDATE listings SET filtered_out = 1');
    process.env.OPENROUTER_API_KEY = 'test-key';
    for (const path of ['prompt', 'package.zip', 'rank']) {
      const res = await post(url(path));
      expect(res.statusCode).toBe(400);
      expect(res.json()).toEqual(NO_CANDIDATES);
    }
  });

  it('prompt: текст із кандидатами; rank без ключа — 409; import порожній — 400', async () => {
    const prompt = (await post(url('prompt'))).json() as { prompt: string };
    expect(prompt.prompt).toContain('iPhone 13 128GB');

    const rank = await post(url('rank'));
    expect(rank.statusCode).toBe(409);
    expect(rank.json()).toEqual(NO_KEY);

    const empty = await post(url('import'));
    expect(empty.statusCode).toBe(400);
    expect(empty.json()).toEqual(EMPTY);
    expect((await post(url('import'), { raw: 'не json' })).statusCode).toBe(400);
  });

  it('package.zip: інструкція, чанк кандидатів за ціною і порожня заготовка номінантів', async () => {
    const res = await post(url('package.zip'));
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toBe('application/zip');
    expect(res.headers['content-disposition']).toBe(`attachment; filename="ai-picks-search-${searchId}.zip"`);

    const files = readZip(res.rawPayload);
    expect([...files.keys()]).toEqual(['prompt.txt', 'candidates/chunk-001.json', 'nominations/nominees-001.json']);
    expect(files.get('nominations/nominees-001.json')).toBe('[]\n');
    const chunk = JSON.parse(files.get('candidates/chunk-001.json') as string) as { id: number }[];
    expect(chunk.map((c) => c.id)).toEqual([await idOf(2), await idOf(1)]);
  });
});

describe('мінуси / плюси', () => {
  const url = (path = '') => `/api/searches/${searchId}/analyze${path}`;
  const BAD_MODE = { error: 'mode має бути cons|pros' };
  const NO_CRITERIA = { error: 'Спершу збережіть критерії пошуку' };
  const saveCriteria = () =>
    db.execute({
      sql: 'UPDATE searches SET analysis_criteria = ? WHERE id = ?',
      args: [JSON.stringify({ cons: ['тріснутий екран'], pros: [] }), searchId],
    });

  it('analyze: режим — 400; без ключа — 409; забагато id — 400; без критеріїв — 400', async () => {
    const badMode = await post(url(), { mode: 'other' });
    expect(badMode.statusCode).toBe(400);
    expect(badMode.json()).toEqual(BAD_MODE);

    const noKey = await post(url(), { mode: 'cons' });
    expect(noKey.statusCode).toBe(409);
    expect(noKey.json()).toEqual(NO_KEY);

    process.env.OPENROUTER_API_KEY = 'test-key';
    const tooMany = await post(url(), { mode: 'cons', ids: manyIds });
    expect(tooMany.statusCode).toBe(400);
    expect(tooMany.json()).toEqual(TOO_MANY);

    const noCriteria = await post(url(), { mode: 'cons' });
    expect(noCriteria.statusCode).toBe(400);
    expect(noCriteria.json()).toEqual(NO_CRITERIA);
  });

  it('package.zip: режим — 400; без критеріїв — 400; інакше інструкція, скрипт, приклад і чанк', async () => {
    expect((await post(url('/package.zip'), { mode: 'other' })).json()).toEqual(BAD_MODE);
    expect((await post(url('/package.zip'), { mode: 'cons' })).json()).toEqual(NO_CRITERIA);

    await saveCriteria();
    const res = await post(url('/package.zip'), { mode: 'cons' });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toBe('application/zip');
    expect(res.headers['content-disposition']).toBe(`attachment; filename="analysis-cons-search-${searchId}.zip"`);

    const files = readZip(res.rawPayload);
    expect([...files.keys()]).toEqual(['prompt.txt', 'analyze.py', 'patterns.example.json', 'descriptions/chunk-001.json']);
    expect(files.get('prompt.txt')).toContain('тріснутий екран');
    const chunk = JSON.parse(files.get('descriptions/chunk-001.json') as string) as { id: number }[];
    expect(chunk.map((l) => l.id).sort()).toEqual([await idOf(1), await idOf(2)].sort());
  });

  it('import: режим — 400; порожньо — 400; не JSON — 400', async () => {
    expect((await post(url('/import'), { mode: 'other', raw: '[]' })).json()).toEqual(BAD_MODE);
    const empty = await post(url('/import'), { mode: 'cons' });
    expect(empty.statusCode).toBe(400);
    expect(empty.json()).toEqual(EMPTY);
    expect((await post(url('/import'), { mode: 'cons', raw: 'не json' })).statusCode).toBe(400);
  });

  it('export json: назва й опис із БД, критерії із запиту', async () => {
    const res = await post(url('/export'), {
      format: 'json',
      mode: 'cons',
      rows: [{ id: await idOf(1), criteria: ['тріснутий екран'] }],
    });
    expect(res.headers['content-disposition']).toBe('attachment; filename="analysis-cons.json"');
    expect(res.json()).toEqual([
      { title: 'iPhone 13 128GB', description: 'стан ідеальний', criteria: ['тріснутий екран'] },
    ]);
  });
});

describe('синоніми запиту', () => {
  it('порожній query — 400; без ключа — 409; import порожній — 400, список — 200', async () => {
    const EMPTY_QUERY = { error: 'Поле query обовʼязкове' };
    const prompt = await post('/api/search-synonyms/prompt', { query: '  ' });
    expect(prompt.statusCode).toBe(400);
    expect(prompt.json()).toEqual(EMPTY_QUERY);
    expect((await post('/api/search-synonyms/generate')).json()).toEqual(EMPTY_QUERY);

    const noKey = await post('/api/search-synonyms/generate', { query: 'iphone' });
    expect(noKey.statusCode).toBe(409);
    expect(noKey.json()).toEqual(NO_KEY);

    const empty = await post('/api/search-synonyms/import');
    expect(empty.statusCode).toBe(400);
    expect(empty.json()).toEqual(EMPTY);
    const ok = await post('/api/search-synonyms/import', { raw: JSON.stringify({ synonyms: ['айфон'] }) });
    expect(ok.statusCode).toBe(200);
  });
});
