import type { InStatement } from '@libsql/client';
import { dbBatchChunked } from '../db.js';

/**
 * Виконати statements, зібрані з кількох репозиторіїв (`…Statement`-функції), batch-ами по BATCH_CHUNK.
 * Лише для повторюваних наборів — див. `dbBatchChunked`.
 */
export function applyStatements(statements: InStatement[]): Promise<void> {
  return dbBatchChunked(statements);
}
