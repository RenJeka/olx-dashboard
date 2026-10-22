import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { testApp } from '../test/app.js';
import { db, dbGet } from '../db/db.js';
import { createSearch, insertListing, resetDb } from '../test/db.js';
import { analysisRoutes } from './analysis/index.js';
import { aiPicksRoutes } from './aiPicks.js';
import { relevanceRoutes } from './relevance.js';

// Характеризаційні тести записів результатів AI (docs/plans/refactor-clean-architecture.md, фаза 4):
// фіксують поточну поведінку до перенесення SQL у db/repos/. Без LLM — лише commit-ендпойнти.
let app: FastifyInstance;
let searchId: number;
let otherSearch: number;

const id = async (olxId: number) => (await dbGet<{ id: number }>('SELECT id FROM listings WHERE olx_id = ?', [olxId]))!.id;
const row = (olxId: number) => dbGet<Record<string, unknown>>('SELECT * FROM listings WHERE olx_id = ?', [olxId]);

beforeAll(async () => {
  app = testApp();
  await app.register(analysisRoutes);
  await app.register(aiPicksRoutes);
  await app.register(relevanceRoutes);
});
afterAll(() => app.close());
beforeEach(async () => {
  await resetDb();
  searchId = await createSearch();
  otherSearch = await createSearch();
  await insertListing(searchId, 1);
  await insertListing(searchId, 2);
  await insertListing(otherSearch, 3);
});

describe('POST /api/listings/analyze/commit', () => {
  it('replace: текст пунктами, джерело import і модель manual за замовчуванням, analysis_stale = 0', async () => {
    await db.execute({ sql: "UPDATE listings SET cons = '• старе', analysis_stale = 1 WHERE olx_id = 1" });
    const res = await app.inject({
      method: 'POST',
      url: '/api/listings/analyze/commit',
      payload: { mode: 'cons', items: [{ id: await id(1), criteria: ['подряпини', 'скол'] }, { id: await id(2), criteria: [] }] },
    });
    expect(res.json()).toEqual({ updated: 2 });
    expect(await row(1)).toMatchObject({
      cons: '• подряпини\n• скол',
      analysis_source: 'import',
      analysis_model: 'manual',
      analysis_stale: 0,
    });
    expect((await row(1))?.analysis_at).not.toBeNull();
    expect((await row(2))?.cons).toBe('');
  });

  it('append: наявні пункти лишаються, дублі (без регістру) не додаються; source api — з моделлю', async () => {
    await db.execute({ sql: "UPDATE listings SET pros = '• Камера' WHERE olx_id = 1" });
    await app.inject({
      method: 'POST',
      url: '/api/listings/analyze/commit',
      payload: { mode: 'pros', merge: 'append', source: 'api', model: 'm', items: [{ id: await id(1), criteria: ['камера', 'екран'] }] },
    });
    expect(await row(1)).toMatchObject({ pros: '• Камера\n• екран', analysis_source: 'api', analysis_model: 'm' });
  });

  it('невідомий режим → 400', async () => {
    const res = await app.inject({ method: 'POST', url: '/api/listings/analyze/commit', payload: { mode: 'x', items: [] } });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toEqual({ error: 'mode має бути cons|pros' });
  });
});

describe('POST /api/searches/:id/ai-picks/commit', () => {
  it('скидає старі ранги пошуку, пише нові; чужий пошук не чіпає', async () => {
    await db.execute({ sql: "UPDATE listings SET ai_rank = 9, ai_pick_reason = 'old' WHERE olx_id IN (2, 3)" });
    const res = await app.inject({
      method: 'POST',
      url: `/api/searches/${searchId}/ai-picks/commit`,
      payload: { picks: [{ id: await id(1), rank: 1, reason: 'дешево' }, { id: await id(3), rank: 2, reason: 'чужий' }] },
    });
    expect(res.json()).toEqual({ committed: 1 });
    expect(await row(1)).toMatchObject({ ai_rank: 1, ai_pick_reason: 'дешево' });
    expect(await row(2)).toMatchObject({ ai_rank: null, ai_pick_reason: null, ai_ranked_at: null });
    expect(await row(3)).toMatchObject({ ai_rank: 9, ai_pick_reason: 'old' });
  });

  it('невідомий пошук → 404', async () => {
    const res = await app.inject({ method: 'POST', url: '/api/searches/999/ai-picks/commit', payload: { picks: [] } });
    expect(res.statusCode).toBe(404);
    expect(res.json()).toEqual({ error: 'Пошук не знайдено' });
  });
});

describe('POST /api/searches/:id/relevance/commit', () => {
  it('пише релевантність; ручний override і чужий пошук не перетирає; source import', async () => {
    await db.execute({ sql: "UPDATE listings SET ai_relevant = 1, ai_relevant_source = 'manual' WHERE olx_id = 2" });
    const res = await app.inject({
      method: 'POST',
      url: `/api/searches/${searchId}/relevance/commit`,
      payload: {
        source: 'import',
        items: [
          { id: await id(1), relevant: false, reason: 'аксесуар' },
          { id: await id(2), relevant: false, reason: 'x' },
          { id: await id(3), relevant: false, reason: 'x' },
        ],
      },
    });
    expect(res.json()).toEqual({ committed: 1 });
    expect(await row(1)).toMatchObject({ ai_relevant: 0, ai_relevant_reason: 'аксесуар', ai_relevant_source: 'import' });
    expect(await row(2)).toMatchObject({ ai_relevant: 1, ai_relevant_source: 'manual' });
    expect(await row(3)).toMatchObject({ ai_relevant: null });
  });

  it('невідомий пошук → 404', async () => {
    const res = await app.inject({ method: 'POST', url: '/api/searches/999/relevance/commit', payload: { items: [] } });
    expect(res.statusCode).toBe(404);
  });
});
