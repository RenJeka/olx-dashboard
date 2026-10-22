import type { InStatement } from '@libsql/client';
import { dbAll, dbBatchChunked, dbGet, dbRun } from '../db.js';
import type { CategoryNode } from '../../types.js';

/** Рядок `olx_categories`. */
export interface CategoryRow {
  id: number;
  parent_id: number | null;
  label: string;
  slug: string;
}

// ── Дерево olx_categories ────────────────────────────────────────────────────

/** Усі вузли дерева за назвою. */
export function listCategoryRows(): Promise<CategoryRow[]> {
  return dbAll<CategoryRow>('SELECT id, parent_id, label, slug FROM olx_categories ORDER BY label');
}

/** Вузли з переданими id (викликач ріже на чанки — ліміт SQLite на змінні). */
export function listCategoryRowsByIds(ids: number[]): Promise<CategoryRow[]> {
  return dbAll<CategoryRow>(
    `SELECT id, parent_id, label, slug FROM olx_categories WHERE id IN (${ids.map(() => '?').join(',')})`,
    ids,
  );
}

export async function categoryExists(id: number): Promise<boolean> {
  return (await dbGet<{ id: number }>('SELECT id FROM olx_categories WHERE id = ?', [id])) !== undefined;
}

/**
 * Upsert вузлів (лише нові/змінені — фільтр робить викликач). Вхідний parentId=null (facet без предка)
 * не затирає збережений parent_id; рядок без змін не переписується (WHERE).
 */
export async function upsertCategoryRows(nodes: CategoryNode[]): Promise<void> {
  await dbBatchChunked(
    nodes.map((n) => ({
      sql: `INSERT INTO olx_categories (id, parent_id, label, slug, updated_at)
            VALUES (?, ?, ?, ?, datetime('now'))
            ON CONFLICT(id) DO UPDATE SET
              parent_id = COALESCE(excluded.parent_id, olx_categories.parent_id),
              label = excluded.label, slug = excluded.slug, updated_at = excluded.updated_at
            WHERE (excluded.parent_id IS NOT NULL AND parent_id IS NOT excluded.parent_id)
               OR label != excluded.label OR slug != excluded.slug`,
      args: [n.id, n.parentId, n.label, n.slug],
    })),
  );
}

/**
 * Ланцюжок від `id` угору до кореня (рекурсивний CTE — лише рядки ланцюжка, без читання всього дерева;
 * Turso-економія). Порядок рядків — від `id` до кореня; глибина обмежена `maxDepth` (захист від циклів).
 */
export function listCategoryChainRows(id: number, maxDepth: number): Promise<CategoryRow[]> {
  return dbAll<CategoryRow>(
    `WITH RECURSIVE chain(id, parent_id, label, slug, depth) AS (
       SELECT id, parent_id, label, slug, 0 FROM olx_categories WHERE id = ?
       UNION ALL
       SELECT c.id, c.parent_id, c.label, c.slug, chain.depth + 1
         FROM olx_categories c JOIN chain ON c.id = chain.parent_id
        WHERE chain.depth < ?
     )
     SELECT id, parent_id, label, slug FROM chain`,
    [id, maxDepth],
  );
}

// ── Базові набори base_criteria ─────────────────────────────────────────────

/** Усі набори (сирий JSON критеріїв). */
export function listAllBaseCriteria(): Promise<{ category_id: number; criteria: string | null }[]> {
  return dbAll('SELECT category_id, criteria FROM base_criteria');
}

/** Набори для переданих категорій — одним `SELECT … WHERE category_id IN (…)`. */
export function listBaseCriteria(categoryIds: number[]): Promise<{ category_id: number; criteria: string | null }[]> {
  return dbAll(
    `SELECT category_id, criteria FROM base_criteria WHERE category_id IN (${categoryIds.map(() => '?').join(',')})`,
    categoryIds,
  );
}

export async function getBaseCriteriaText(categoryId: number): Promise<string | null | undefined> {
  return (await dbGet<{ criteria: string | null }>('SELECT criteria FROM base_criteria WHERE category_id = ?', [categoryId]))
    ?.criteria;
}

export async function upsertBaseCriteria(categoryId: number, criteria: string): Promise<void> {
  await dbRun(
    `INSERT INTO base_criteria (category_id, criteria, updated_at) VALUES (?, ?, datetime('now'))
       ON CONFLICT(category_id) DO UPDATE SET criteria = excluded.criteria, updated_at = excluded.updated_at`,
    [categoryId, criteria],
  );
}

/** Statement для batch: оновити наявний набір категорії. */
export function baseCriteriaStatement(categoryId: number, criteria: string): InStatement {
  return {
    sql: "UPDATE base_criteria SET criteria = ?, updated_at = datetime('now') WHERE category_id = ?",
    args: [criteria, categoryId],
  };
}

// ── Пошуки й оголошення в розрізі категорій ─────────────────────────────────

/** Пошук, чия автокатегорія — у піддереві категорії: стан для remap базового набору. */
export interface SubtreeSearchRow {
  id: number;
  local_filters: string | null;
  base_disabled: string | null;
  analysis_criteria: string | null;
}

/** Пошуки піддерева категорії: рекурсивний CTE вниз від `id` — без читання всього дерева. */
export function listSubtreeSearches(categoryId: number, maxDepth: number): Promise<SubtreeSearchRow[]> {
  return dbAll<SubtreeSearchRow>(
    `WITH RECURSIVE sub(id, depth) AS (
       SELECT id, 0 FROM olx_categories WHERE id = ?
       UNION
       SELECT c.id, sub.depth + 1 FROM olx_categories c JOIN sub ON c.parent_id = sub.id WHERE sub.depth < ?
     )
     SELECT id, local_filters, base_disabled, analysis_criteria FROM searches
      WHERE base_category_id IN (SELECT id FROM sub)`,
    [categoryId, maxDepth],
  );
}

/** Statement для batch: змінені колонки пошуку (`columns` — імена з коду, не з вводу). */
export function searchColumnsStatement(
  searchId: number,
  columns: Partial<Record<'local_filters' | 'base_disabled' | 'analysis_criteria', string>>,
): InStatement | null {
  const entries = Object.entries(columns);
  if (entries.length === 0) return null;
  return {
    sql: `UPDATE searches SET ${entries.map(([col]) => `${col} = ?`).join(', ')} WHERE id = ?`,
    args: [...entries.map(([, value]) => value as string), searchId],
  };
}

/** Фільтри й поточна автокатегорія пошуку. */
export function getSearchCategoryState(
  searchId: number,
): Promise<{ local_filters: string | null; base_category_id: number | null } | undefined> {
  return dbGet('SELECT local_filters, base_category_id FROM searches WHERE id = ?', [searchId]);
}

/** Кількість оголошень пошуку по категоріях (один GROUP BY). */
export function countListingsByCategory(searchId: number): Promise<{ category_id: number; n: number }[]> {
  return dbAll(
    `SELECT category_id, COUNT(*) AS n FROM listings
      WHERE search_id = ? AND category_id IS NOT NULL GROUP BY category_id`,
    [searchId],
  );
}

export async function setSearchBaseCategory(searchId: number, categoryId: number | null): Promise<void> {
  await dbRun('UPDATE searches SET base_category_id = ? WHERE id = ?', [categoryId, searchId]);
}
