import { dbAll, dbRun } from '../db.js';

export interface LogsFilter {
  level?: 'warn' | 'error';
  scope?: string;
  limit: number;
}

/** Записи app_logs, новіші спершу. */
export function listLogs(filter: LogsFilter): Promise<Record<string, unknown>[]> {
  const conditions: string[] = [];
  const args: (string | number)[] = [];
  if (filter.level) {
    conditions.push('level = ?');
    args.push(filter.level);
  }
  if (filter.scope) {
    conditions.push('scope = ?');
    args.push(filter.scope);
  }
  args.push(filter.limit);

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  return dbAll(
    `SELECT id, ts, level, scope, stage, message, details
       FROM app_logs ${where} ORDER BY ts DESC, id DESC LIMIT ?`,
    args,
  );
}

/** Усі наявні scope — для селектора фільтра в UI (окремий легкий запит). */
export async function listLogScopes(): Promise<string[]> {
  return (await dbAll<{ scope: string }>('SELECT DISTINCT scope FROM app_logs ORDER BY scope')).map((s) => s.scope);
}

/** Видалити всі записи → кількість видалених. */
export async function clearLogs(): Promise<number> {
  return (await dbRun('DELETE FROM app_logs')).rowsAffected;
}
