/**
 * Єдиний сервіс логування (docs/plans/logging-system.md).
 *
 * Ядро — pino (той самий, що вбудований у Fastify; передається в нього через
 * `loggerInstance`, тож HTTP-логи і наші йдуть одним потоком). Поверх — персистентний
 * журнал warn+error у таблиці `app_logs` (перегляд у UI, GET /api/logs): кожен запис
 * обов'язково несе `scope` (модуль) і `stage` (крок data flow, де саме сталося).
 *
 * Правила:
 * - `logError`/`logWarn` — єдині точки запису в журнал; звичайні info/debug — через
 *   `getLogger(scope)` (лише stdout, БД не чіпають — бережемо Turso rows written).
 * - Запис у БД — fire-and-forget: збій запису журналу НЕ валить бізнес-логіку і НЕ
 *   рекурсує (повідомлення про нього йде лише в stdout).
 * - У dev консоль читабельна через pino-pretty (вмикається лише якщо пакет резолвиться —
 *   у проді devDeps може не бути, сервер не повинен падати).
 */
import { createRequire } from 'node:module';
import { pino, type Logger, type LoggerOptions } from 'pino';
import { dbRun } from './db/db.js';

/** Скільки днів зберігати записи журналу (чистка на старті сервера). */
const LOG_RETENTION_DAYS = 14;

/** Обрізка stack у details — довгі стеки не роздувають рядок БД. */
const STACK_MAX_CHARS = 3000;

const isProd = process.env.NODE_ENV === 'production';

function resolvePrettyTransport(): LoggerOptions['transport'] {
  if (isProd) return undefined;
  try {
    // pino-pretty — devDep: у продакшн-встановленні його може не бути.
    createRequire(import.meta.url).resolve('pino-pretty');
    return {
      target: 'pino-pretty',
      options: { translateTime: 'SYS:HH:MM:ss', ignore: 'pid,hostname' },
    };
  } catch {
    return undefined;
  }
}

/** Кореневий логер: передається у Fastify (`loggerInstance`) і породжує child-логери. */
export const rootLogger: Logger = pino({
  level: process.env.LOG_LEVEL ?? (isProd ? 'info' : 'debug'),
  transport: resolvePrettyTransport(),
});

/** Child-логер модуля: усі записи нестимуть `{scope}`. Для info/debug (без запису в БД). */
export function getLogger(scope: string): Logger {
  return rootLogger.child({ scope });
}

const INSERT_LOG_SQL =
  'INSERT INTO app_logs (ts, level, scope, stage, message, details) VALUES (?, ?, ?, ?, ?, ?)';

/** Fire-and-forget запис у app_logs; збій — лише у stdout (без рекурсії в журнал). */
function persist(
  level: 'warn' | 'error',
  scope: string,
  stage: string,
  message: string,
  details: Record<string, unknown>,
): void {
  const detailsJson = Object.keys(details).length > 0 ? JSON.stringify(details) : null;
  void dbRun(INSERT_LOG_SQL, [new Date().toISOString(), level, scope, stage, message, detailsJson])
    .catch((err) => {
      rootLogger.warn(
        { scope: 'logger' },
        `запис у app_logs не вдався: ${err instanceof Error ? err.message : String(err)}`,
      );
    });
}

/**
 * Помилка → stdout (pino) + журнал app_logs. `stage` — крок data flow, де сталося
 * (напр. "bisect ₴0–5000", "variant «біговел» 2/4", "POST /api/searches/3/scan").
 */
export function logError(
  scope: string,
  stage: string,
  err: unknown,
  details?: Record<string, unknown>,
): void {
  const message = err instanceof Error ? err.message : String(err);
  const stack = err instanceof Error && err.stack ? err.stack.slice(0, STACK_MAX_CHARS) : undefined;
  const merged = { ...(details ?? {}), ...(stack ? { stack } : {}) };
  rootLogger.error({ scope, stage, ...merged }, message);
  persist('error', scope, stage, message, merged);
}

/** Попередження (best-effort збій, транзієнтний ретрай…) → stdout + журнал app_logs. */
export function logWarn(
  scope: string,
  stage: string,
  message: string,
  details?: Record<string, unknown>,
): void {
  rootLogger.warn({ scope, stage, ...(details ?? {}) }, message);
  persist('warn', scope, stage, message, details ?? {});
}

/** Retention: видалити записи, старші за LOG_RETENTION_DAYS. Викликається на старті сервера. */
export async function cleanupOldLogs(): Promise<void> {
  try {
    await dbRun(`DELETE FROM app_logs WHERE ts < datetime('now', '-${LOG_RETENTION_DAYS} days')`);
  } catch (err) {
    rootLogger.warn(
      { scope: 'logger' },
      `retention-чистка app_logs не вдалася: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}
