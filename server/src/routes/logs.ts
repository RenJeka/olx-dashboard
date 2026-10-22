import type { FastifyInstance } from 'fastify';
import { deleteAllLogs, getLogs, type LogsQuery } from '../services/logs.js';

/**
 * Технічний журнал застосунку (docs/plans/old/logging-system.md): перегляд і очищення
 * app_logs. Пишуть сюди logError/logWarn (server/src/logger.ts).
 */
export async function logsRoutes(app: FastifyInstance): Promise<void> {
  app.get<{ Querystring: LogsQuery }>('/api/logs', (req) => getLogs(req.query));

  app.delete('/api/logs', () => deleteAllLogs());
}
