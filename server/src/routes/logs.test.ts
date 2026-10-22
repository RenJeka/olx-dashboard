import Fastify, { type FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { db, dbAll } from '../db/db.js';
import { resetDb } from '../test/db.js';
import { logsRoutes } from './logs.js';

// Характеризаційні тести (docs/plans/refactor-clean-architecture.md, фаза 0): фіксують поточну поведінку.
let app: FastifyInstance;

async function log(ts: string, level: string, scope: string): Promise<void> {
  await db.execute({
    sql: 'INSERT INTO app_logs (ts, level, scope, message) VALUES (?, ?, ?, ?)',
    args: [ts, level, scope, `${level} ${scope}`],
  });
}

interface LogsResponse {
  logs: { message: string }[];
  scopes: string[];
}

const get = async (query = '') => (await app.inject({ url: `/api/logs${query}` })).json() as LogsResponse;

beforeAll(async () => {
  app = Fastify();
  await app.register(logsRoutes);
});
afterAll(() => app.close());
beforeEach(async () => {
  await resetDb();
  await log('2026-10-01T10:00:00.000Z', 'warn', 'scanner');
  await log('2026-10-02T10:00:00.000Z', 'error', 'analysis');
  await log('2026-10-03T10:00:00.000Z', 'error', 'scanner');
});

describe('GET /api/logs', () => {
  it('новіші спершу; scopes — усі, за абеткою', async () => {
    const res = await get();
    expect(res.logs.map((l) => l.message)).toEqual(['error scanner', 'error analysis', 'warn scanner']);
    expect(res.scopes).toEqual(['analysis', 'scanner']);
  });

  it('фільтри level і scope; невідомий level ігнорується', async () => {
    expect((await get('?level=error&scope=scanner')).logs.map((l) => l.message)).toEqual(['error scanner']);
    expect((await get('?level=info')).logs).toHaveLength(3);
  });

  it('limit; невалідний — типовий', async () => {
    expect((await get('?limit=1')).logs).toHaveLength(1);
    expect((await get('?limit=abc')).logs).toHaveLength(3);
  });

  it('scopes не залежать від фільтра', async () => {
    expect((await get('?scope=analysis')).scopes).toEqual(['analysis', 'scanner']);
  });
});

describe('DELETE /api/logs', () => {
  it('видаляє всі й повертає кількість', async () => {
    const res = await app.inject({ method: 'DELETE', url: '/api/logs' });
    expect(res.json()).toEqual({ deleted: 3 });
    expect(await dbAll('SELECT id FROM app_logs')).toHaveLength(0);
  });
});
