import { db, dbAll, dbGet, dbRun } from '../db.js';

/** Рядок `searches` як є (`SELECT *`) — роути віддають його фронту без перетворень. */
export type SearchRecord = Record<string, unknown> & { id: number };

/** Колонки, які змінює PATCH /api/searches/:id (білий список — імена йдуть у SQL). */
export type SearchColumn =
  | 'name'
  | 'query'
  | 'category_id'
  | 'api_filters'
  | 'local_filters'
  | 'cron_enabled'
  | 'query_synonyms'
  | 'archived'
  | 'project_id';

export type SearchValue = string | number | null;

export interface NewSearch {
  name: string;
  query: string;
  categoryId: number | null;
  apiFilters: string;
  localFilters: string;
  cronEnabled: number;
  sortOrder: number;
  querySynonyms: string;
  archived: number;
  projectId: number | null;
}

/** Позиція пошуку в ручному сортуванні. */
export interface SearchPosition {
  id: number;
  sort_order: number;
  project_id: number | null;
}

export function listSearches(): Promise<SearchRecord[]> {
  return dbAll<SearchRecord>('SELECT * FROM searches ORDER BY sort_order ASC, created_at DESC, id DESC');
}

export function getSearchRecord(id: number): Promise<SearchRecord | undefined> {
  return dbGet<SearchRecord>('SELECT * FROM searches WHERE id = ?', [id]);
}

export async function searchExists(id: number): Promise<boolean> {
  return (await dbGet('SELECT id FROM searches WHERE id = ?', [id])) !== undefined;
}

export async function minSearchSortOrder(): Promise<number | null> {
  return (await dbGet<{ min: number | null }>('SELECT MIN(sort_order) AS min FROM searches'))?.min ?? null;
}

/** INSERT → id нового пошуку. */
export async function insertSearch(s: NewSearch): Promise<number> {
  const info = await dbRun(
    `INSERT INTO searches (name, query, category_id, api_filters, local_filters, cron_enabled, sort_order, query_synonyms, archived, project_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      s.name,
      s.query,
      s.categoryId,
      s.apiFilters,
      s.localFilters,
      s.cronEnabled,
      s.sortOrder,
      s.querySynonyms,
      s.archived,
      s.projectId,
    ],
  );
  return Number(info.lastInsertRowid);
}

/** UPDATE переданих колонок (порожній набір — без запиту). */
export async function updateSearchColumns(id: number, columns: Partial<Record<SearchColumn, SearchValue>>): Promise<void> {
  const entries = Object.entries(columns) as [SearchColumn, SearchValue][];
  if (entries.length === 0) return;
  await dbRun(
    `UPDATE searches SET ${entries.map(([col]) => `${col} = ?`).join(', ')} WHERE id = ?`,
    [...entries.map(([, value]) => value), id],
  );
}

/** Каскадне видалення: price_history → scan_runs → listings → searches. */
export async function deleteSearchCascade(id: number): Promise<void> {
  // Чисті DELETE без проміжних рішень → batch у неявній транзакції (порядок: FK-залежні спершу).
  await db.batch(
    [
      {
        sql: `DELETE FROM price_history WHERE listing_id IN (SELECT id FROM listings WHERE search_id = ?)`,
        args: [id],
      },
      { sql: 'DELETE FROM scan_runs WHERE search_id = ?', args: [id] },
      { sql: 'DELETE FROM listings WHERE search_id = ?', args: [id] },
      { sql: 'DELETE FROM searches WHERE id = ?', args: [id] },
    ],
    'write',
  );
}

export function getSearchPosition(id: number): Promise<SearchPosition | undefined> {
  return dbGet<SearchPosition>('SELECT id, sort_order, project_id FROM searches WHERE id = ?', [id]);
}

/**
 * Сусід за ручним порядком — лише серед активних (не архівних) у межах ТІЄЇ Ж групи-проекту
 * (project_id збігається; NULL = група «Без проекту»).
 */
export function findSearchNeighbor(
  current: SearchPosition,
  direction: 'up' | 'down',
): Promise<{ id: number; sort_order: number } | undefined> {
  const sameProject = '(project_id = ? OR (? IS NULL AND project_id IS NULL))';
  return dbGet<{ id: number; sort_order: number }>(
    direction === 'up'
      ? `SELECT id, sort_order FROM searches WHERE sort_order < ? AND archived = 0 AND ${sameProject} ORDER BY sort_order DESC LIMIT 1`
      : `SELECT id, sort_order FROM searches WHERE sort_order > ? AND archived = 0 AND ${sameProject} ORDER BY sort_order ASC LIMIT 1`,
    [current.sort_order, current.project_id, current.project_id],
  );
}

/** Обмін sort_order двох пошуків одним batch. */
export async function swapSearchSortOrder(
  a: { id: number; sort_order: number },
  b: { id: number; sort_order: number },
): Promise<void> {
  await db.batch(
    [
      { sql: 'UPDATE searches SET sort_order = ? WHERE id = ?', args: [b.sort_order, a.id] },
      { sql: 'UPDATE searches SET sort_order = ? WHERE id = ?', args: [a.sort_order, b.id] },
    ],
    'write',
  );
}

/** Кешований facet категорій OLX з останнього скану (JSON або null). */
export async function getCategoryFacet(id: number): Promise<string | null> {
  return (await dbGet<{ category_facet: string | null }>('SELECT category_facet FROM searches WHERE id = ?', [id]))
    ?.category_facet ?? null;
}
