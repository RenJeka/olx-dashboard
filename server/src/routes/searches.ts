import type { FastifyInstance } from 'fastify';
import { db } from '../db/db.js';
import { runScan } from '../scanner.js';

interface SearchBody {
  name?: string;
  query?: string;
  category_id?: number | null;
  api_filters?: unknown;
  local_filters?: unknown;
  cron_enabled?: number;
}

/** api_filters/local_filters приймаємо як обʼєкт або рядок → зберігаємо як JSON-рядок. */
function toJsonText(value: unknown, fallback = '{}'): string {
  if (value == null) return fallback;
  if (typeof value === 'string') return value;
  return JSON.stringify(value);
}

export async function searchesRoutes(app: FastifyInstance): Promise<void> {
  // Список пошуків
  app.get('/api/searches', async () => {
    return db.prepare('SELECT * FROM searches ORDER BY created_at DESC').all();
  });

  // Один пошук
  app.get<{ Params: { id: string } }>('/api/searches/:id', async (req, reply) => {
    const row = db
      .prepare('SELECT * FROM searches WHERE id = ?')
      .get(Number(req.params.id));
    if (!row) return reply.code(404).send({ error: 'Пошук не знайдено' });
    return row;
  });

  // Створення
  app.post<{ Body: SearchBody }>('/api/searches', async (req, reply) => {
    const { name, query } = req.body;
    if (!name || !query) {
      return reply.code(400).send({ error: 'Поля name і query обовʼязкові' });
    }

    const info = db
      .prepare(
        `INSERT INTO searches (name, query, category_id, api_filters, local_filters, cron_enabled)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run(
        name,
        query,
        req.body.category_id ?? null,
        toJsonText(req.body.api_filters),
        toJsonText(req.body.local_filters),
        req.body.cron_enabled ?? 0,
      );

    return reply
      .code(201)
      .send(
        db
          .prepare('SELECT * FROM searches WHERE id = ?')
          .get(Number(info.lastInsertRowid)),
      );
  });

  // Оновлення
  app.patch<{ Params: { id: string }; Body: SearchBody }>(
    '/api/searches/:id',
    async (req, reply) => {
      const id = Number(req.params.id);
      const existing = db.prepare('SELECT * FROM searches WHERE id = ?').get(id);
      if (!existing) return reply.code(404).send({ error: 'Пошук не знайдено' });

      const fields: string[] = [];
      const values: unknown[] = [];

      if (req.body.name != null) {
        fields.push('name = ?');
        values.push(req.body.name);
      }
      if (req.body.query != null) {
        fields.push('query = ?');
        values.push(req.body.query);
      }
      if (req.body.category_id !== undefined) {
        fields.push('category_id = ?');
        values.push(req.body.category_id);
      }
      if (req.body.api_filters !== undefined) {
        fields.push('api_filters = ?');
        values.push(toJsonText(req.body.api_filters));
      }
      if (req.body.local_filters !== undefined) {
        fields.push('local_filters = ?');
        values.push(toJsonText(req.body.local_filters));
      }
      if (req.body.cron_enabled !== undefined) {
        fields.push('cron_enabled = ?');
        values.push(req.body.cron_enabled);
      }

      if (fields.length > 0) {
        values.push(id);
        db.prepare(`UPDATE searches SET ${fields.join(', ')} WHERE id = ?`).run(
          ...values,
        );
      }

      return db.prepare('SELECT * FROM searches WHERE id = ?').get(id);
    },
  );

  // Видалення
  app.delete<{ Params: { id: string } }>(
    '/api/searches/:id',
    async (req, reply) => {
      const id = Number(req.params.id);
      const info = db.prepare('DELETE FROM searches WHERE id = ?').run(id);
      if (info.changes === 0) {
        return reply.code(404).send({ error: 'Пошук не знайдено' });
      }
      return { deleted: true };
    },
  );

  // Сканування
  app.post<{ Params: { id: string } }>(
    '/api/searches/:id/scan',
    async (req, reply) => {
      const id = Number(req.params.id);
      try {
        const result = await runScan(id);
        return result;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        app.log.error({ err }, 'Помилка сканування');
        return reply.code(500).send({ error: message });
      }
    },
  );
}
