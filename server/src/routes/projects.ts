import type { FastifyInstance } from 'fastify';
import { db } from '../db/db.js';

interface ProjectBody {
  name?: string;
}

export async function projectsRoutes(app: FastifyInstance): Promise<void> {
  // Список проектів
  app.get('/api/projects', async () => {
    return db
      .prepare('SELECT * FROM projects ORDER BY sort_order ASC, created_at DESC, id DESC')
      .all();
  });

  // Створення
  app.post<{ Body: ProjectBody }>('/api/projects', async (req, reply) => {
    const name = req.body.name?.trim();
    if (!name) {
      return reply.code(400).send({ error: 'Поле name обовʼязкове' });
    }

    // Новий проект з'являється згори списку.
    const { min } = db.prepare('SELECT MIN(sort_order) AS min FROM projects').get() as {
      min: number | null;
    };
    const sortOrder = (min ?? 0) - 1;

    const info = db
      .prepare('INSERT INTO projects (name, sort_order) VALUES (?, ?)')
      .run(name, sortOrder);

    return reply
      .code(201)
      .send(db.prepare('SELECT * FROM projects WHERE id = ?').get(Number(info.lastInsertRowid)));
  });

  // Перейменування
  app.patch<{ Params: { id: string }; Body: ProjectBody }>(
    '/api/projects/:id',
    async (req, reply) => {
      const id = Number(req.params.id);
      const existing = db.prepare('SELECT id FROM projects WHERE id = ?').get(id);
      if (!existing) return reply.code(404).send({ error: 'Проект не знайдено' });

      const name = req.body.name?.trim();
      if (name) {
        db.prepare('UPDATE projects SET name = ? WHERE id = ?').run(name, id);
      }

      return db.prepare('SELECT * FROM projects WHERE id = ?').get(id);
    },
  );

  // Видалення: відв'язуємо пошуки (project_id = NULL), пошуки НЕ видаляємо.
  app.delete<{ Params: { id: string } }>('/api/projects/:id', async (req, reply) => {
    const id = Number(req.params.id);
    const existing = db.prepare('SELECT id FROM projects WHERE id = ?').get(id);
    if (!existing) return reply.code(404).send({ error: 'Проект не знайдено' });

    const deleteTx = db.transaction((projectId: number) => {
      db.prepare('UPDATE searches SET project_id = NULL WHERE project_id = ?').run(projectId);
      db.prepare('DELETE FROM projects WHERE id = ?').run(projectId);
    });
    deleteTx(id);

    return { deleted: true };
  });

  // Ручне сортування (стрілки ↑/↓): міняє sort_order із сусідом за поточним порядком.
  app.post<{ Params: { id: string }; Body: { direction?: 'up' | 'down' } }>(
    '/api/projects/:id/move',
    async (req, reply) => {
      const id = Number(req.params.id);
      const direction = req.body.direction;
      if (direction !== 'up' && direction !== 'down') {
        return reply.code(400).send({ error: 'direction має бути "up" або "down"' });
      }

      const current = db.prepare('SELECT id, sort_order FROM projects WHERE id = ?').get(id) as
        | { id: number; sort_order: number }
        | undefined;
      if (!current) return reply.code(404).send({ error: 'Проект не знайдено' });

      const neighbor = (
        direction === 'up'
          ? db.prepare(
              'SELECT id, sort_order FROM projects WHERE sort_order < ? ORDER BY sort_order DESC LIMIT 1',
            )
          : db.prepare(
              'SELECT id, sort_order FROM projects WHERE sort_order > ? ORDER BY sort_order ASC LIMIT 1',
            )
      ).get(current.sort_order) as { id: number; sort_order: number } | undefined;

      if (neighbor) {
        const swap = db.transaction(
          (a: { id: number; sort_order: number }, b: { id: number; sort_order: number }) => {
            const update = db.prepare('UPDATE projects SET sort_order = ? WHERE id = ?');
            update.run(b.sort_order, a.id);
            update.run(a.sort_order, b.id);
          },
        );
        swap(current, neighbor);
      }

      return db.prepare('SELECT * FROM projects WHERE id = ?').get(id);
    },
  );
}
