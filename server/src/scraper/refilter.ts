import type { InStatement } from '@libsql/client';
import { dbAll, dbBatchChunked, dbGet } from '../db/db.js';
import { evaluateFilteredOut, parseLocalFilters, type FilterableListing } from './localFilters.js';

type RefilterRow = FilterableListing & { id: number; filtered_out: number };

/**
 * Ретроактивний перерахунок `filtered_out` для всіх рядків пошуку після зміни `local_filters`
 * (business-rules.md → filtered_out). Рішення рахуються в JS; пишуться лише рядки, у яких
 * значення змінилось, batch-ами (dbBatchChunked) — великий пошук не впирається в ліміт payload
 * Turso і не витрачає write на незмінні рядки (S16).
 */
export async function recomputeFilteredOut(
  searchId: number,
): Promise<{ filtered_out_count: number; changed: number }> {
  const filtersRow = await dbGet<{ local_filters: string }>(
    'SELECT local_filters FROM searches WHERE id = ?',
    [searchId],
  );
  const localFilters = parseLocalFilters(filtersRow?.local_filters);

  const rows = await dbAll<RefilterRow>(
    // Лише поля активних правил: опис/назва/params великого пошуку — десятки МБ із Turso (S16).
    'SELECT id, price, city, seller_name, pros, cons, category_id, filtered_out FROM listings WHERE search_id = ?',
    [searchId],
  );

  let filteredOutCount = 0;
  const statements: InStatement[] = [];
  for (const row of rows) {
    const filteredOut = evaluateFilteredOut(localFilters, row) ? 1 : 0;
    filteredOutCount += filteredOut;
    if (filteredOut !== row.filtered_out) {
      statements.push({ sql: 'UPDATE listings SET filtered_out = ? WHERE id = ?', args: [filteredOut, row.id] });
    }
  }
  await dbBatchChunked(statements);
  return { filtered_out_count: filteredOutCount, changed: statements.length };
}
