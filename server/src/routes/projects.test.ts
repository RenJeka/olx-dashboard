import Fastify, { type FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { db, dbAll, dbGet } from '../db/db.js';
import { createSearch, resetDb } from '../test/db.js';
import { projectsRoutes } from './projects.js';

// Характеризаційні тести (docs/plans/refactor-clean-architecture.md, фаза 0): фіксують поточну поведінку.
let app: FastifyInstance;

interface ProjectRow {
  id: number;
  name: string;
  sort_order: number | null;
}

async function create(name: string): Promise<ProjectRow> {
  const res = await app.inject({ method: 'POST', url: '/api/projects', payload: { name } });
  return res.json() as ProjectRow;
}

const names = async () => ((await (await app.inject({ url: '/api/projects' })).json()) as ProjectRow[]).map((p) => p.name);

beforeAll(async () => {
  app = Fastify();
  await app.register(projectsRoutes);
});
afterAll(() => app.close());
beforeEach(resetDb);

describe('POST /api/projects', () => {
  it('201, назва обрізається; новий — згори списку', async () => {
    await create('A');
    const res = await app.inject({ method: 'POST', url: '/api/projects', payload: { name: '  B  ' } });
    expect(res.statusCode).toBe(201);
    expect((res.json() as ProjectRow).name).toBe('B');
    expect(await names()).toEqual(['B', 'A']);
  });

  it('порожня назва → 400', async () => {
    const res = await app.inject({ method: 'POST', url: '/api/projects', payload: { name: '  ' } });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toEqual({ error: 'Поле name обовʼязкове' });
  });
});

describe('PATCH /api/projects/:id', () => {
  it('перейменовує; порожня назва — без змін', async () => {
    const p = await create('A');
    const renamed = await app.inject({ method: 'PATCH', url: `/api/projects/${p.id}`, payload: { name: 'C' } });
    expect((renamed.json() as ProjectRow).name).toBe('C');
    const same = await app.inject({ method: 'PATCH', url: `/api/projects/${p.id}`, payload: { name: '' } });
    expect((same.json() as ProjectRow).name).toBe('C');
  });

  it('невідомий → 404', async () => {
    const res = await app.inject({ method: 'PATCH', url: '/api/projects/999', payload: { name: 'x' } });
    expect(res.statusCode).toBe(404);
    expect(res.json()).toEqual({ error: 'Проект не знайдено' });
  });
});

describe('DELETE /api/projects/:id', () => {
  it('відв’язує пошуки, пошуки лишаються', async () => {
    const p = await create('A');
    const searchId = await createSearch();
    await db.execute({ sql: 'UPDATE searches SET project_id = ? WHERE id = ?', args: [p.id, searchId] });

    const res = await app.inject({ method: 'DELETE', url: `/api/projects/${p.id}` });
    expect(res.json()).toEqual({ deleted: true });
    expect(await dbAll('SELECT id FROM projects')).toHaveLength(0);
    expect(await dbGet('SELECT project_id FROM searches WHERE id = ?', [searchId])).toEqual({ project_id: null });
  });

  it('невідомий → 404', async () => {
    expect((await app.inject({ method: 'DELETE', url: '/api/projects/999' })).statusCode).toBe(404);
  });
});

describe('POST /api/projects/:id/move', () => {
  it('міняє місцями з сусідом; на краю — без змін', async () => {
    await create('A');
    const b = await create('B'); // список: B, A
    const down = await app.inject({ method: 'POST', url: `/api/projects/${b.id}/move`, payload: { direction: 'down' } });
    expect(down.statusCode).toBe(200);
    expect(await names()).toEqual(['A', 'B']);

    await app.inject({ method: 'POST', url: `/api/projects/${b.id}/move`, payload: { direction: 'down' } });
    expect(await names()).toEqual(['A', 'B']);
  });

  it('невалідний напрям → 400; невідомий → 404', async () => {
    const p = await create('A');
    const bad = await app.inject({ method: 'POST', url: `/api/projects/${p.id}/move`, payload: { direction: 'left' } });
    expect(bad.statusCode).toBe(400);
    expect(bad.json()).toEqual({ error: 'direction має бути "up" або "down"' });
    const missing = await app.inject({ method: 'POST', url: '/api/projects/999/move', payload: { direction: 'up' } });
    expect(missing.statusCode).toBe(404);
  });
});
