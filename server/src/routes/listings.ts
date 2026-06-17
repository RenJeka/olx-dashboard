import type { FastifyInstance } from 'fastify';
import { db } from '../db/db.js';
import { LISTING_STATUSES, type ListingPatch } from '../types.js';

// Білий список колонок для сортування (захист від SQL-інʼєкцій).
const SORTABLE = new Set([
  'price',
  'title',
  'city',
  'posted_at',
  'first_seen_at',
  'last_seen_at',
]);

const LISTING_COLUMNS = `id, olx_id, search_id, title, url, price, currency, city, district,
                photo_url, description, seller_name, contact_name, olx_status,
                status, status_source, note, pros, cons, filtered_out, miss_count,
                analysis_at, analysis_source, analysis_model, analysis_stale,
                ai_rank, ai_pick_reason, ai_ranked_at,
                posted_at, first_seen_at, last_seen_at`;

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
        `SELECT ${LISTING_COLUMNS}
         FROM listings
         WHERE search_id = ?
         ORDER BY ${sort} ${order}`,
      )
      .all(searchId);
  });

  // Ручна зміна статусу/нотатки. Будь-яка зміна статусу → status_source='manual', miss_count=0.
  app.patch<{ Params: { id: string }; Body: ListingPatch }>(
    '/api/listings/:id',
    async (req, reply) => {
      const id = Number(req.params.id);
      const existing = db.prepare('SELECT id FROM listings WHERE id = ?').get(id);
      if (!existing) return reply.code(404).send({ error: 'Оголошення не знайдено' });

      const { status, note, pros, cons } = req.body;

      if (status !== undefined && !LISTING_STATUSES.includes(status)) {
        return reply.code(400).send({ error: `Невідомий статус: ${status}` });
      }

      const fields: string[] = [];
      const values: unknown[] = [];

      if (status !== undefined) {
        fields.push("status = ?", "status_source = 'manual'", 'miss_count = 0');
        values.push(status);
      }
      if (note !== undefined) {
        fields.push('note = ?');
        values.push(note);
      }
      if (pros !== undefined) {
        fields.push('pros = ?');
        values.push(pros);
      }
      if (cons !== undefined) {
        fields.push('cons = ?');
        values.push(cons);
      }

      if (fields.length > 0) {
        values.push(id);
        db.prepare(`UPDATE listings SET ${fields.join(', ')} WHERE id = ?`).run(...values);
      }

      return db.prepare(`SELECT ${LISTING_COLUMNS} FROM listings WHERE id = ?`).get(id);
    },
  );
}
