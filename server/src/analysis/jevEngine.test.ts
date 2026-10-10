import Fastify, { type FastifyInstance } from 'fastify';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createSearch, insertListing, resetDb } from '../test/db.js';
import { relevanceRoutes } from '../routes/relevance.js';
import { matchingRoutes } from '../routes/analysis/matching.js';
import { db } from '../db/db.js';
import { JEV_CRITERIA_THRESHOLD, JEV_RELEVANCE_THRESHOLD } from './constants.js';
import type { JevQuestion, JevResult, JevState } from './jev.js';
import { resolveCriteriaThreshold, runJevMatching, runJevRelevance } from './jevEngine.js';
import type { PromptListing } from './prompts.js';

// decide замокано: мережі немає, відповідь Jev задає тест (за назвою з state).
const decideMock = vi.hoisted(() => vi.fn<(state: JevState, questions: Record<string, JevQuestion>) => Promise<JevResult>>());
vi.mock('./jev.js', async (importOriginal) => ({ ...(await importOriginal<typeof import('./jev.js')>()), decide: decideMock }));

const titleOf = (state: JevState) => (typeof state === 'string' ? state : (state.title ?? ''));

/** Відповідь Jev: на кожне питання — noul з `probs` за назвою оголошення (дефолт 0). */
function answerWith(probs: Record<string, Record<string, number>>) {
  decideMock.mockImplementation(async (state, questions) => {
    const byKey = probs[titleOf(state)] ?? {};
    if (byKey.fail !== undefined) throw new Error('Jev HTTP 400: bad');
    return {
      model: 'typesafe/jev-1.13-test',
      answers: Object.fromEntries(Object.keys(questions).map((k) => [k, { type: 'noul' as const, noul: byKey[k] ?? 0 }])),
      usage: { input_tokens: 600, output_tokens: 0, cost: 0.00003 },
    };
  });
}

const listing = (id: number, title: string, description = 'Опис'): PromptListing => ({ id, title, description, params: null });

afterEach(() => decideMock.mockReset());

describe('runJevRelevance (крок 1)', () => {
  it('префільтр відсіює до Jev; поріг і reason «Jev 0.xx»; usage і модель прогону', async () => {
    answerWith({
      'iPhone 13 128GB': { relevant: 0.93 },
      'iPhone 13 на запчастини': { relevant: JEV_RELEVANCE_THRESHOLD - 0.01 },
      'iPhone 13 Pro': { relevant: JEV_RELEVANCE_THRESHOLD },
    });
    const res = await runJevRelevance('iphone 13', [
      listing(1, 'iPhone 13 128GB'),
      listing(2, 'iPhone 13 на запчастини'),
      listing(3, 'iPhone 13 Pro'),
      listing(4, 'Samsung Galaxy S21'),
    ]);
    const byId = new Map(res.results.map((r) => [r.id, r]));

    expect(decideMock).toHaveBeenCalledTimes(3); // Samsung відсіяно кодом — у Jev не пішов
    expect(byId.get(1)).toEqual({ id: 1, relevant: true, reason: 'Jev 0.93' });
    expect(byId.get(2)?.relevant).toBe(false);
    expect(byId.get(3)?.relevant).toBe(true); // рівно поріг — релевантне
    expect(byId.get(4)?.relevant).toBe(false);
    expect(res.usage).toEqual({ requests: 3, cost: expect.closeTo(0.00009, 8) });
    expect(res.model).toBe('typesafe/jev-1.13-test');
    expect(res.errors).toEqual([]);
  });

  it('короткий state: опис обрізано, синоніми — у питанні', async () => {
    answerWith({});
    await runJevRelevance('iphone 13', [listing(1, 'iPhone 13', 'а'.repeat(2000))], ['айфон 13']);
    const [state, questions] = decideMock.mock.calls[0]!;
    expect(typeof state === 'object' && state.description?.length).toBeLessThan(2000);
    expect(questions.relevant?.instructions).toContain('айфон 13');
  });

  it('збій окремого оголошення не валить прогін — один рядок errors', async () => {
    answerWith({ 'iPhone 13 A': { relevant: 0.9 }, 'iPhone 13 B': { fail: 1 } });
    const res = await runJevRelevance('iphone 13', [listing(1, 'iPhone 13 A'), listing(2, 'iPhone 13 B')]);
    expect(res.results.map((r) => r.id)).toEqual([1]);
    expect(res.errors).toHaveLength(1);
    expect(res.errors[0]).toMatch(/не оброблено 1 з 2/);
  });
});

describe('runJevMatching (крок 2)', () => {
  it('критерій ≥ порогу → item без evidence, ok, з probability; оголошення без збігів — з порожнім items', async () => {
    answerWith({
      'Полиця A': { cons_0: 0.95, cons_1: JEV_CRITERIA_THRESHOLD - 0.01 },
      'Полиця B': {},
    });
    const groups = [
      { name: 'зламана', aliases: [], enabled: true },
      { name: 'подряпини', aliases: [], enabled: true },
    ];
    const res = await runJevMatching(groups, 'cons', [listing(1, 'Полиця A'), listing(2, 'Полиця B')]);
    const byId = new Map(res.results.map((r) => [r.id, r.items]));

    expect(byId.get(1)).toEqual([{ criterion: 'зламана', evidence: '', ok: true, probability: 0.95 }]);
    expect(byId.get(2)).toEqual([]);
    expect(Object.keys(decideMock.mock.calls[0]![1])).toEqual(['cons_0', 'cons_1']);
    expect(res.usage?.requests).toBe(2);
  });

  it('поріг з налаштувань: 0.9 відсікає 0.8, типовий (0.7) — ні', async () => {
    answerWith({ 'Полиця A': { cons_0: 0.8 } });
    const groups = [{ name: 'зламана', aliases: [], enabled: true }];
    const strict = await runJevMatching(groups, 'cons', [listing(1, 'Полиця A')], { threshold: 0.9 });
    const byDefault = await runJevMatching(groups, 'cons', [listing(1, 'Полиця A')]);

    expect(strict.results[0]?.items).toEqual([]);
    expect(byDefault.results[0]?.items).toHaveLength(1);
  });
});

describe('resolveCriteriaThreshold', () => {
  it('число в межах — як є; поза межами чи не число — типовий поріг', () => {
    expect(resolveCriteriaThreshold(0.85)).toBe(0.85);
    expect(resolveCriteriaThreshold(0.1)).toBe(JEV_CRITERIA_THRESHOLD);
    expect(resolveCriteriaThreshold(1)).toBe(JEV_CRITERIA_THRESHOLD);
    expect(resolveCriteriaThreshold('0.8')).toBe(JEV_CRITERIA_THRESHOLD);
    expect(resolveCriteriaThreshold(undefined)).toBe(JEV_CRITERIA_THRESHOLD);
  });
});

// ── Маршрути: engine='jev' ──────────────────────────────────────────────────

describe('маршрути з engine=jev', () => {
  let app: FastifyInstance;
  let searchId: number;
  const savedKey = process.env.OPENROUTER_API_KEY;

  beforeAll(async () => {
    app = Fastify();
    await app.register(relevanceRoutes);
    await app.register(matchingRoutes);
  });
  afterAll(async () => {
    await app.close();
    if (savedKey === undefined) delete process.env.OPENROUTER_API_KEY;
    else process.env.OPENROUTER_API_KEY = savedKey;
  });
  beforeEach(async () => {
    process.env.OPENROUTER_API_KEY = 'test-key';
    await resetDb();
    searchId = await createSearch();
    await insertListing(searchId, 1, { description: 'Стан ідеальний' });
    await db.batch(
      [
        { sql: 'UPDATE listings SET title = ? WHERE olx_id = 1', args: ['iPhone 13 128GB'] },
        {
          sql: 'UPDATE searches SET analysis_criteria = ? WHERE id = ?',
          args: [JSON.stringify({ cons: ['подряпини', { name: 'вимкнена', aliases: [], enabled: false }], pros: [] }), searchId],
        },
      ],
      'write',
    );
  });

  it('без OPENROUTER_API_KEY → 409 на обох кроках, Jev не викликається', async () => {
    delete process.env.OPENROUTER_API_KEY;
    const rel = await app.inject({ method: 'POST', url: `/api/searches/${searchId}/relevance/analyze`, payload: { engine: 'jev' } });
    const an = await app.inject({ method: 'POST', url: `/api/searches/${searchId}/analyze`, payload: { engine: 'jev', mode: 'cons' } });
    expect(rel.statusCode).toBe(409);
    expect(an.statusCode).toBe(409);
    expect(decideMock).not.toHaveBeenCalled();
  });

  it('крок 1 і крок 2 через Jev повертають usage і модель', async () => {
    answerWith({ 'iPhone 13 128GB': { relevant: 0.8, cons_0: 0.75 } });
    const rel = await app.inject({ method: 'POST', url: `/api/searches/${searchId}/relevance/analyze`, payload: { engine: 'jev' } });
    expect(rel.statusCode).toBe(200);
    expect(rel.json()).toMatchObject({ results: [{ relevant: true, reason: 'Jev 0.80' }], model: 'typesafe/jev-1.13-test', usage: { requests: 1 } });

    const an = await app.inject({ method: 'POST', url: `/api/searches/${searchId}/analyze`, payload: { engine: 'jev', mode: 'cons' } });
    expect(an.statusCode).toBe(200);
    expect(an.json()).toMatchObject({ results: [{ items: [{ criterion: 'подряпини', probability: 0.75, evidence: '' }] }], usage: { requests: 1 } });
    // Вимкнена категорія («в аналізі» = ні) у Jev не йде.
    expect(Object.keys(decideMock.mock.calls.at(-1)![1])).toEqual(['cons_0']);
  });

  it('крок 2: threshold з тіла запиту застосовується (0.8 відсікає 0.75)', async () => {
    answerWith({ 'iPhone 13 128GB': { cons_0: 0.75 } });
    const an = await app.inject({
      method: 'POST',
      url: `/api/searches/${searchId}/analyze`,
      payload: { engine: 'jev', mode: 'cons', threshold: 0.8 },
    });
    expect(an.json()).toMatchObject({ results: [{ items: [] }] });
  });
});
