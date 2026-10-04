import Fastify, { type FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { db } from '../db/db.js';
import { createSearch, resetDb } from '../test/db.js';
import { listingsRoutes } from './listings.js';

// Легка відповідь /listings (docs/plans/listings-light-payload.md): без повного опису й галереї.
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
