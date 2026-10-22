import { clearLogs, listLogScopes, listLogs } from '../db/repos/logs.js';

/** Максимум записів за один запит (UI показує останні; глибше — фільтрами). */
const LOGS_LIMIT_MAX = 1000;
const LOGS_LIMIT_DEFAULT = 300;

export interface LogsQuery {
  /** warn | error — без фільтра віддаються обидва рівні. */
  level?: string;
  /** Точний збіг scope (scanner | graphql-client | analysis | …). */
  scope?: string;
  limit?: string;
}

/** Журнал + усі наявні scope (незалежно від фільтра). Невідомий level ігнорується, невалідний limit — типовий. */
export async function getLogs(query: LogsQuery): Promise<{ logs: Record<string, unknown>[]; scopes: string[] }> {
  const level = query.level === 'warn' || query.level === 'error' ? query.level : undefined;
  const limitRaw = Number(query.limit);
  const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? Math.min(limitRaw, LOGS_LIMIT_MAX) : LOGS_LIMIT_DEFAULT;

  const logs = await listLogs({ level, scope: query.scope?.trim() || undefined, limit });
  const scopes = await listLogScopes();
  return { logs, scopes };
}

export async function deleteAllLogs(): Promise<{ deleted: number }> {
  return { deleted: await clearLogs() };
}
