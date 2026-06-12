import type { FastifyInstance } from 'fastify';
import { db } from '../db/db.js';
import { runScan } from '../scanner.js';
import { evaluateFilteredOut } from '../scraper/localFilters.js';
import type { LocalFilters, ParamKeyInfo, SearchStats } from '../types.js';

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
    return db
      .prepare('SELECT * FROM searches ORDER BY sort_order ASC, created_at DESC, id DESC')
      .all();
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

    // Новий пошук з'являється згори списку.
    const { min } = db.prepare('SELECT MIN(sort_order) AS min FROM searches').get() as {
      min: number | null;
    };
    const sortOrder = (min ?? 0) - 1;

    const info = db
      .prepare(
        `INSERT INTO searches (name, query, category_id, api_filters, local_filters, cron_enabled, sort_order)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        name,
        query,
        req.body.category_id ?? null,
        toJsonText(req.body.api_filters),
        toJsonText(req.body.local_filters),
        req.body.cron_enabled ?? 0,
        sortOrder,
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

      const search = db.prepare('SELECT * FROM searches WHERE id = ?').get(id);

      // Зміна local_filters → ретроактивний перерахунок filtered_out для всіх рядків пошуку.
      if (req.body.local_filters === undefined) return search;

      const { local_filters } = db.prepare('SELECT local_filters FROM searches WHERE id = ?').get(id) as {
        local_filters: string;
      };
      let localFilters: LocalFilters = {};
      try {
        localFilters = JSON.parse(local_filters || '{}') as LocalFilters;
      } catch {
        localFilters = {};
      }

      const listingRows = db
        .prepare('SELECT id, title, description, params FROM listings WHERE search_id = ?')
        .all(id) as { id: number; title: string | null; description: string | null; params: string | null }[];

      const updateFilteredOut = db.prepare('UPDATE listings SET filtered_out = ? WHERE id = ?');
      const recompute = db.transaction((rows: typeof listingRows) => {
        let count = 0;
        for (const row of rows) {
          const filteredOut = evaluateFilteredOut(localFilters, row);
          if (filteredOut) count++;
          updateFilteredOut.run(filteredOut ? 1 : 0, row.id);
        }
        return count;
      });

      const filteredOutCount = recompute(listingRows);

      return { ...(search as object), filtered_out_count: filteredOutCount };
    },
  );

  // Видалення (каскадне: price_history → scan_runs → listings → searches)
  app.delete<{ Params: { id: string } }>(
    '/api/searches/:id',
    async (req, reply) => {
      const id = Number(req.params.id);
      const existing = db.prepare('SELECT id FROM searches WHERE id = ?').get(id);
      if (!existing) {
        return reply.code(404).send({ error: 'Пошук не знайдено' });
      }

      const deleteCascade = db.transaction((searchId: number) => {
        db.prepare(
          `DELETE FROM price_history WHERE listing_id IN (SELECT id FROM listings WHERE search_id = ?)`,
        ).run(searchId);
        db.prepare('DELETE FROM scan_runs WHERE search_id = ?').run(searchId);
        db.prepare('DELETE FROM listings WHERE search_id = ?').run(searchId);
        db.prepare('DELETE FROM searches WHERE id = ?').run(searchId);
      });
      deleteCascade(id);

      return { deleted: true };
    },
  );

  // Ручне сортування (стрілки ↑/↓): міняє sort_order із сусідом за поточним порядком.
  app.post<{ Params: { id: string }; Body: { direction?: 'up' | 'down' } }>(
    '/api/searches/:id/move',
    async (req, reply) => {
      const id = Number(req.params.id);
      const direction = req.body.direction;
      if (direction !== 'up' && direction !== 'down') {
        return reply.code(400).send({ error: 'direction має бути "up" або "down"' });
      }

      const current = db.prepare('SELECT id, sort_order FROM searches WHERE id = ?').get(id) as
        | { id: number; sort_order: number }
        | undefined;
      if (!current) return reply.code(404).send({ error: 'Пошук не знайдено' });

      const neighbor = (
        direction === 'up'
          ? db.prepare(
              'SELECT id, sort_order FROM searches WHERE sort_order < ? ORDER BY sort_order DESC LIMIT 1',
            )
          : db.prepare(
              'SELECT id, sort_order FROM searches WHERE sort_order > ? ORDER BY sort_order ASC LIMIT 1',
            )
      ).get(current.sort_order) as { id: number; sort_order: number } | undefined;

      if (neighbor) {
        const swap = db.transaction(
          (a: { id: number; sort_order: number }, b: { id: number; sort_order: number }) => {
            const update = db.prepare('UPDATE searches SET sort_order = ? WHERE id = ?');
            update.run(b.sort_order, a.id);
            update.run(a.sort_order, b.id);
          },
        );
        swap(current, neighbor);
      }

      return db.prepare('SELECT * FROM searches WHERE id = ?').get(id);
    },
  );

  // Сканування. ?deep=true — глибокий скан (батчі з паузами, до ~50 запитів).
  app.post<{ Params: { id: string }; Querystring: { deep?: string } }>(
    '/api/searches/:id/scan',
    async (req, reply) => {
      const id = Number(req.params.id);
      const deep = req.query.deep === 'true';
      try {
        const result = await runScan(id, { deep });
        return result;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        app.log.error({ err }, 'Помилка сканування');
        return reply.code(500).send({ error: message });
      }
    },
  );

  // Статус останнього скану — для поллінгу прогресу глибокого скану.
  app.get<{ Params: { id: string } }>(
    '/api/searches/:id/scan-status',
    async (req, reply) => {
      const id = Number(req.params.id);
      const row = db
        .prepare(
          `SELECT id, started_at, finished_at, found, new_count, error, requests_done, requests_total
           FROM scan_runs WHERE search_id = ? ORDER BY id DESC LIMIT 1`,
        )
        .get(id);
      if (!row) return reply.code(404).send({ error: 'Сканів ще не було' });
      return row;
    },
  );

  // Розподіл усіх ключів params цього пошуку (для дропдауна конструктора діапазонів).
  app.get<{ Params: { id: string } }>('/api/searches/:id/param-keys', async (req) => {
    const id = Number(req.params.id);
    const rows = db
      .prepare("SELECT params FROM listings WHERE search_id = ? AND params IS NOT NULL AND params != '{}'")
      .all(id) as { params: string }[];

    const samplesByKey = new Map<string, string[]>();
    for (const row of rows) {
      let params: Record<string, string>;
      try {
        params = JSON.parse(row.params) as Record<string, string>;
      } catch {
        continue;
      }
      for (const [key, value] of Object.entries(params)) {
        if (!samplesByKey.has(key)) samplesByKey.set(key, []);
        const samples = samplesByKey.get(key) as string[];
        if (samples.length < 3 && !samples.includes(value)) samples.push(value);
      }
    }

    const result: ParamKeyInfo[] = Array.from(samplesByKey.entries())
      .map(([key, samples]) => ({ key, samples }))
      .sort((a, b) => a.key.localeCompare(b.key));

    return result;
  });

  // Статистика для панелі дій: скільки в базі, скільки "давно не бачених", останній скан.
  app.get<{ Params: { id: string } }>('/api/searches/:id/stats', async (req, reply) => {
    const id = Number(req.params.id);
    const search = db.prepare('SELECT id FROM searches WHERE id = ?').get(id);
    if (!search) return reply.code(404).send({ error: 'Пошук не знайдено' });

    const { in_db } = db
      .prepare('SELECT COUNT(*) AS in_db FROM listings WHERE search_id = ?')
      .get(id) as { in_db: number };

    const { stale_count } = db
      .prepare(
        `SELECT COUNT(*) AS stale_count FROM listings
         WHERE search_id = ? AND status_source = 'auto' AND last_seen_at < datetime('now', '-3 days')`,
      )
      .get(id) as { stale_count: number };

    const lastScan = db
      .prepare(
        `SELECT kind, started_at, finished_at, found, new_count, disabled_count, error
         FROM scan_runs WHERE search_id = ? ORDER BY id DESC LIMIT 1`,
      )
      .get(id) as SearchStats['last_scan'] | undefined;

    const stats: SearchStats = { in_db, stale_count, last_scan: lastScan ?? null };
    return stats;
  });
}
