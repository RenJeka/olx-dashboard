import type { FastifyInstance } from 'fastify';
import type { InValue } from '@libsql/client';
import { dbAll, dbGet, dbRun } from '../db/db.js';
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
                category_id, category_type,
                photo_url, photo_urls, description, seller_name, contact_name, olx_status,
                status, status_source, note, pros, cons, filtered_out, miss_count,
                analysis_at, analysis_source, analysis_model, analysis_stale,
                ai_rank, ai_pick_reason, ai_ranked_at,
                ai_relevant, ai_relevant_reason, ai_relevant_at, ai_relevant_source,
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

    return dbAll(
      `SELECT ${LISTING_COLUMNS}
         FROM listings
         WHERE search_id = ?
         ORDER BY ${sort} ${order}`,
      [searchId],
    );
  });

  // Ручна зміна статусу/нотатки. Будь-яка зміна статусу → status_source='manual', miss_count=0.
  app.patch<{ Params: { id: string }; Body: ListingPatch }>(
    '/api/listings/:id',
    async (req, reply) => {
      const id = Number(req.params.id);
      const existing = await dbGet('SELECT id FROM listings WHERE id = ?', [id]);
      if (!existing) return reply.code(404).send({ error: 'Оголошення не знайдено' });

      const { status, note, pros, cons, ai_relevant, olx_status } = req.body;

      if (status !== undefined && !LISTING_STATUSES.includes(status)) {
        return reply.code(400).send({ error: `Невідомий статус: ${status}` });
      }

      // Ручний override «Активності» — лише фіксований набір або null («невідоме»).
      if (
        olx_status !== undefined &&
        olx_status !== null &&
        !['active', 'inactive', 'removed'].includes(olx_status)
      ) {
        return reply.code(400).send({ error: `Невідоме значення olx_status: ${olx_status}` });
      }

      const fields: string[] = [];
      const values: InValue[] = [];

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
      // Ручний override семантичного фільтра: позначаємо source='manual', щоб авто-прогін не перетер.
      if (ai_relevant !== undefined) {
        fields.push(
          'ai_relevant = ?',
          "ai_relevant_source = 'manual'",
          "ai_relevant_at = datetime('now')",
        );
        values.push(ai_relevant === null ? null : ai_relevant ? 1 : 0);
      }
      // Разова підказка — БЕЗ source-захисту (скан/verify перепише, коли побачить оголошення).
      if (olx_status !== undefined) {
        fields.push('olx_status = ?');
        values.push(olx_status);
      }

      if (fields.length > 0) {
        values.push(id);
        await dbRun(`UPDATE listings SET ${fields.join(', ')} WHERE id = ?`, values);
      }

      return dbGet(`SELECT ${LISTING_COLUMNS} FROM listings WHERE id = ?`, [id]);
    },
  );
}
