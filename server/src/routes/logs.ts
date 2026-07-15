import type { FastifyInstance } from 'fastify';
import { dbAll, dbRun } from '../db/db.js';

/** Максимум записів за один запит (UI показує останні; глибше — фільтрами). */
const LOGS_LIMIT_MAX = 1000;
const LOGS_LIMIT_DEFAULT = 300;

interface LogsQuery {
  /** warn | error — без фільтра віддаються обидва рівні. */
  level?: string;
  /** Точний збіг scope (scanner | graphql-client | analysis | …). */
  scope?: string;
  limit?: string;
}

/**
 * Технічний журнал застосунку (docs/plans/logging-system.md): перегляд і очищення
 * app_logs. Пишуть сюди logError/logWarn (server/src/logger.ts).
 */
export async function logsRoutes(app: FastifyInstance): Promise<void> {
  app.get<{ Querystring: LogsQuery }>('/api/logs', async (req) => {
    const conditions: string[] = [];
    const args: (string | number)[] = [];

    if (req.query.level === 'warn' || req.query.level === 'error') {
      conditions.push('level = ?');
      args.push(req.query.level);
    }
    const scope = req.query.scope?.trim();
    if (scope) {
      conditions.push('scope = ?');
      args.push(scope);
    }

    const limitRaw = Number(req.query.limit);
    const limit = Number.isFinite(limitRaw) && limitRaw > 0
      ? Math.min(limitRaw, LOGS_LIMIT_MAX)
      : LOGS_LIMIT_DEFAULT;
    args.push(limit);

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const rows = await dbAll(
      `SELECT id, ts, level, scope, stage, message, details
       FROM app_logs ${where} ORDER BY ts DESC, id DESC LIMIT ?`,
      args,
    );

    // Окремим легким запитом — усі наявні scope для селектора фільтра в UI.
    const scopes = await dbAll<{ scope: string }>(
      'SELECT DISTINCT scope FROM app_logs ORDER BY scope',
    );

    return { logs: rows, scopes: scopes.map((s) => s.scope) };
  });

  app.delete('/api/logs', async () => {
    const res = await dbRun('DELETE FROM app_logs');
    return { deleted: res.rowsAffected };
  });
}
