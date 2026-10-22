import type { FastifyInstance } from 'fastify';
import { createProject, deleteProject, listAllProjects, moveProject, updateProject } from '../services/projects.js';

interface ProjectBody {
  name?: string;
}

// Помилки сервісу (404/400) відповідає глобальний обробник (routes/errorHandler.ts).
export async function projectsRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/projects', () => listAllProjects());

  app.post<{ Body: ProjectBody }>('/api/projects', async (req, reply) => {
    return reply.code(201).send(await createProject(req.body?.name));
  });

  // Перейменування
  app.patch<{ Params: { id: string }; Body: ProjectBody }>('/api/projects/:id', (req) =>
    updateProject(Number(req.params.id), req.body?.name),
  );

  // Видалення: відв'язуємо пошуки (project_id = NULL), пошуки НЕ видаляємо.
  app.delete<{ Params: { id: string } }>('/api/projects/:id', (req) => deleteProject(Number(req.params.id)));

  // Ручне сортування (стрілки ↑/↓): міняє sort_order із сусідом за поточним порядком.
  app.post<{ Params: { id: string }; Body: { direction?: 'up' | 'down' } }>('/api/projects/:id/move', (req) =>
    moveProject(Number(req.params.id), req.body?.direction),
  );
}
