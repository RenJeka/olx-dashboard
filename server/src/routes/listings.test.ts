import Fastify, { type FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { db, dbGet } from '../db/db.js';
import { createSearch, resetDb } from '../test/db.js';
import { listingsRoutes } from './listings.js';

// Легка відповідь /listings (docs/plans/old/listings-light-payload.md): без повного опису й галереї.
let app: FastifyInstance;
let searchId: number;

const LONG = `<p>Стан ідеальний<br />батарея 91%</p>${'а'.repeat(1000)}`;

async function insert(olxId: number, title: string, description: string | null): Promise<number> {
  const res = await db.execute({
    sql: 'INSERT INTO listings (olx_id, search_id, title, description, photo_urls) VALUES (?, ?, ?, ?, ?)',
    args: [olxId, searchId, title, description, '["a.jpg","b.jpg"]'],
  });
  return Number(res.lastInsertRowid);
}

beforeAll(async () => {
  app = Fastify();
  await app.register(listingsRoutes);
});
afterAll(() => app.close());
beforeEach(async () => {
  await resetDb();
  searchId = await createSearch();
});

describe('GET /api/searches/:id/listings', () => {
  it('без повного опису й галереї; фрагмент опису — чистий текст із «…»', async () => {
    await insert(1, 'iPhone 13', LONG);
    await insert(2, 'iPhone 12', null);

    const res = await app.inject(`/api/searches/${searchId}/listings`);
    const rows = res.json() as Record<string, unknown>[];
    const withDesc = rows.find((r) => r.olx_id === 1)!;

    expect(res.statusCode).toBe(200);
    expect(withDesc).not.toHaveProperty('description');
    expect(withDesc).not.toHaveProperty('photo_urls');
    expect(withDesc).not.toHaveProperty('description_head');
    expect(withDesc.has_description).toBe(true);
    expect(String(withDesc.description_preview)).toMatch(/^Стан ідеальний\nбатарея 91%а+…$/);
    expect(rows.find((r) => r.olx_id === 2)).toMatchObject({ has_description: false, description_preview: null });
  });
});

describe('деталі на вимогу', () => {
  it('GET /api/listings/:id/details — повний опис і галерея', async () => {
    const id = await insert(1, 'iPhone 13', LONG);
    const res = await app.inject(`/api/listings/${id}/details`);
    expect(res.json()).toEqual({ id, description: LONG, photo_urls: '["a.jpg","b.jpg"]' });
    expect((await app.inject('/api/listings/999999/details')).statusCode).toBe(404);
  });

  it('POST /api/searches/:id/listings/details — пакетом, лише рядки цього пошуку', async () => {
    const id = await insert(1, 'iPhone 13', LONG);
    const res = await app.inject({
      method: 'POST',
      url: `/api/searches/${searchId}/listings/details`,
      payload: { ids: [id, 999999] },
    });
    expect((res.json() as { id: number }[]).map((r) => r.id)).toEqual([id]);
  });
});

describe('GET /api/searches/:id/listings/search', () => {
  it('шукає в назві й описі з булевими операторами', async () => {
    const a = await insert(1, 'iPhone 13', '<p>Батарея 91%</p>');
    const b = await insert(2, 'iPhone 12', '<p>Розбитий екран</p>');
    const search = (q: string, extra = '') =>
      app
        .inject(`/api/searches/${searchId}/listings/search?q=${encodeURIComponent(q)}${extra}`)
        .then((r) => (r.json() as { ids: number[] }).ids);

    expect(await search('батарея')).toEqual([a]);
    expect(await search('iphone && !розбитий')).toEqual([a]);
    expect(await search('батарея', '&description=0')).toEqual([]);
    expect(await search('12', '&description=0')).toEqual([b]);
  });
});

// Характеризаційні тести (docs/plans/refactor-clean-architecture.md, фаза 0): фіксують поточну поведінку.
describe('PATCH /api/listings/:id', () => {
  const patch = (id: number, payload: object) => app.inject({ method: 'PATCH', url: `/api/listings/${id}`, payload });
  const row = (id: number) =>
    dbGet<Record<string, unknown>>(
      'SELECT status, status_source, miss_count, note, ai_relevant, ai_relevant_source, ai_relevant_at, olx_status FROM listings WHERE id = ?',
      [id],
    );

  it('статус → manual, miss_count = 0; відповідь — легкий рядок', async () => {
    const id = await insert(1, 'iPhone', LONG);
    await db.execute({ sql: 'UPDATE listings SET miss_count = 3 WHERE id = ?', args: [id] });
    const res = await patch(id, { status: 'interested', note: 'дзвонити' });
    expect(res.statusCode).toBe(200);
    const body = res.json() as Record<string, unknown>;
    expect(body).toMatchObject({ id, status: 'interested', note: 'дзвонити', has_description: true });
    expect(body).not.toHaveProperty('description');
    expect(await row(id)).toMatchObject({ status: 'interested', status_source: 'manual', miss_count: 0 });
  });

  it('нотатка без статусу не робить статус ручним', async () => {
    const id = await insert(1, 'iPhone', null);
    await patch(id, { note: 'x' });
    expect(await row(id)).toMatchObject({ status: 'new', status_source: 'auto', note: 'x' });
  });

  it('ai_relevant → manual з часом; null — «невідоме»; olx_status — без source', async () => {
    const id = await insert(1, 'iPhone', null);
    await patch(id, { ai_relevant: false, olx_status: 'removed' });
    const after = await row(id);
    expect(after).toMatchObject({ ai_relevant: 0, ai_relevant_source: 'manual', olx_status: 'removed' });
    expect(after?.ai_relevant_at).not.toBeNull();

    await patch(id, { ai_relevant: null, olx_status: null });
    expect(await row(id)).toMatchObject({ ai_relevant: null, olx_status: null });
  });

  it('невідомий статус / olx_status → 400; невідоме оголошення → 404', async () => {
    const id = await insert(1, 'iPhone', null);
    const badStatus = await patch(id, { status: 'sold' });
    expect(badStatus.statusCode).toBe(400);
    expect(badStatus.json()).toEqual({ error: 'Невідомий статус: sold' });
    const badOlx = await patch(id, { olx_status: 'gone' });
    expect(badOlx.json()).toEqual({ error: 'Невідоме значення olx_status: gone' });
    const missing = await patch(999, { note: 'x' });
    expect(missing.statusCode).toBe(404);
    expect(missing.json()).toEqual({ error: 'Оголошення не знайдено' });
  });
});
