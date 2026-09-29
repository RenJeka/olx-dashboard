import type { FastifyInstance } from 'fastify';
import { db, dbAll, dbGet, dbRun } from '../db/db.js';

interface ProjectBody {
  name?: string;
}

export async function projectsRoutes(app: FastifyInstance): Promise<void> {
  // Список проектів
  app.get('/api/projects', async () => {
    return dbAll('SELECT * FROM projects ORDER BY sort_order ASC, created_at DESC, id DESC');
  });

  // Створення
  app.post<{ Body: ProjectBody }>('/api/projects', async (req, reply) => {
    const name = req.body?.name?.trim();
    if (!name) {
      return reply.code(400).send({ error: 'Поле name обовʼязкове' });
    }

    // Новий проект з'являється згори списку.
    const minRow = await dbGet<{ min: number | null }>('SELECT MIN(sort_order) AS min FROM projects');
    const sortOrder = (minRow?.min ?? 0) - 1;

    const info = await dbRun('INSERT INTO projects (name, sort_order) VALUES (?, ?)', [name, sortOrder]);

    return reply
      .code(201)
      .send(await dbGet('SELECT * FROM projects WHERE id = ?', [Number(info.lastInsertRowid)]));
  });

  // Перейменування
  app.patch<{ Params: { id: string }; Body: ProjectBody }>(
    '/api/projects/:id',
    async (req, reply) => {
      const id = Number(req.params.id);
      const existing = await dbGet('SELECT id FROM projects WHERE id = ?', [id]);
      if (!existing) return reply.code(404).send({ error: 'Проект не знайдено' });

      const name = req.body?.name?.trim();
      if (name) {
        await dbRun('UPDATE projects SET name = ? WHERE id = ?', [name, id]);
      }

      return dbGet('SELECT * FROM projects WHERE id = ?', [id]);
    },
  );

  // Видалення: відв'язуємо пошуки (project_id = NULL), пошуки НЕ видаляємо.
  app.delete<{ Params: { id: string } }>('/api/projects/:id', async (req, reply) => {
    const id = Number(req.params.id);
    const existing = await dbGet('SELECT id FROM projects WHERE id = ?', [id]);
    if (!existing) return reply.code(404).send({ error: 'Проект не знайдено' });

    // Чисті записи (відв'язування + видалення) → batch у неявній транзакції.
    await db.batch(
      [
        { sql: 'UPDATE searches SET project_id = NULL WHERE project_id = ?', args: [id] },
        { sql: 'DELETE FROM projects WHERE id = ?', args: [id] },
      ],
      'write',
    );

    return { deleted: true };
  });

  // Ручне сортування (стрілки ↑/↓): міняє sort_order із сусідом за поточним порядком.
  app.post<{ Params: { id: string }; Body: { direction?: 'up' | 'down' } }>(
    '/api/projects/:id/move',
    async (req, reply) => {
      const id = Number(req.params.id);
      const direction = req.body?.direction;
      if (direction !== 'up' && direction !== 'down') {
        return reply.code(400).send({ error: 'direction має бути "up" або "down"' });
      }

      const current = await dbGet<{ id: number; sort_order: number }>(
        'SELECT id, sort_order FROM projects WHERE id = ?',
        [id],
      );
      if (!current) return reply.code(404).send({ error: 'Проект не знайдено' });

      const neighbor = await dbGet<{ id: number; sort_order: number }>(
        direction === 'up'
          ? 'SELECT id, sort_order FROM projects WHERE sort_order < ? ORDER BY sort_order DESC LIMIT 1'
          : 'SELECT id, sort_order FROM projects WHERE sort_order > ? ORDER BY sort_order ASC LIMIT 1',
        [current.sort_order],
      );

      if (neighbor) {
        await db.batch(
          [
            { sql: 'UPDATE projects SET sort_order = ? WHERE id = ?', args: [neighbor.sort_order, current.id] },
            { sql: 'UPDATE projects SET sort_order = ? WHERE id = ?', args: [current.sort_order, neighbor.id] },
          ],
          'write',
        );
      }

      return dbGet('SELECT * FROM projects WHERE id = ?', [id]);
    },
  );
}
