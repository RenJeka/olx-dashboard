import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { PromptListing } from './prompts.js';
import type { ListingRow } from './repo.js';
import { stripHtml } from './text.js';

// analyze.py лежить поряд із цим файлом у analysis/ — тому шлях прямий, без '../'.
export const ANALYZE_PY_PATH = join(dirname(fileURLToPath(import.meta.url)), 'analyze.py');

export function toPromptListing(row: ListingRow): PromptListing {
  return { id: row.id, title: row.title, description: row.description, params: row.params };
}

// Текст для верифікації evidence: title + опис (критерії можуть бути лише в заголовку,
// напр. «iPhone на запчастини» — тоді evidence із заголовка теж має проходити перевірку).
export function descriptionMap(rows: ListingRow[]): Map<number, string> {
  const map = new Map<number, string>();
  for (const row of rows) {
    const title = row.title ? `${row.title}\n` : '';
    map.set(row.id, title + stripHtml(row.description));
  }
  return map;
}

export function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}
