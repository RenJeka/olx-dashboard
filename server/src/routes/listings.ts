import type { FastifyInstance } from 'fastify';
import { db } from '../db/db.js';

// Білий список колонок для сортування (захист від SQL-інʼєкцій).
const SORTABLE = new Set([
  'price',
  'title',
  'city',
  'posted_at',
  'first_seen_at',
  'last_seen_at',
]);

export async function listingsRoutes(app: FastifyInstance): Promise<void> {
  app.get<{
    Params: { id: string };
    Querystring: { sort?: string; order?: string };
  }>('/api/searches/:id/listings', async (req) => {
    const searchId = Number(req.params.id);

    const sort = SORTABLE.has(req.query.sort ?? '')
      ? (req.query.sort as string)
      : 'first_seen_at';
    const order = req.query.order?.toLowerCase() === 'asc' ? 'ASC' : 'DESC';

    return db
      .prepare(
        `SELECT id, olx_id, search_id, title, url, price, currency, city, district,
                photo_url, status, posted_at, first_seen_at, last_seen_at
         FROM listings
         WHERE search_id = ?
         ORDER BY ${sort} ${order}`,
      )
      .all(searchId);
  });
}
