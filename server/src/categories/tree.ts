/**
 * Глобальне дерево категорій OLX (таблиця `olx_categories`), що накопичується зі скану пошуків
 * і збирача (docs/plans/base-criteria.md).
 */
import { dbAll, dbBatchChunked } from '../db/db.js';
import type { CategoryNode } from '../types.js';

/**
 * Upsert вузлів дерева. Рядок пишеться лише якщо він новий або змінився хоч одним полем
 * (Turso-економія: повторний скан того самого дерева — 0 записів). Повертає кількість нових/змінених.
 */
export async function upsertCategories(nodes: CategoryNode[]): Promise<number> {
  if (nodes.length === 0) return 0;

  const before = new Map(
    (
      await dbAll<{ id: number; parent_id: number | null; label: string; slug: string }>(
        'SELECT id, parent_id, label, slug FROM olx_categories',
      )
    ).map((r) => [r.id, r]),
  );

  const changed = nodes.filter((n) => {
    const old = before.get(n.id);
    return !old || old.parent_id !== n.parentId || old.label !== n.label || old.slug !== n.slug;
  });
  if (changed.length === 0) return 0;

  await dbBatchChunked(
    changed.map((n) => ({
      sql: `INSERT INTO olx_categories (id, parent_id, label, slug, updated_at)
            VALUES (?, ?, ?, ?, datetime('now'))
            ON CONFLICT(id) DO UPDATE SET
              parent_id = excluded.parent_id, label = excluded.label, slug = excluded.slug,
              updated_at = excluded.updated_at
            WHERE parent_id IS NOT excluded.parent_id OR label != excluded.label OR slug != excluded.slug`,
      args: [n.id, n.parentId, n.label, n.slug],
    })),
  );
  return changed.length;
}
