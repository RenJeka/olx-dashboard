/**
 * Глобальне дерево категорій OLX (таблиця `olx_categories`), що накопичується зі скану пошуків
 * і збирача (docs/plans/base-criteria.md).
 */
import { dbAll, dbBatchChunked, dbGet, dbRun } from '../db/db.js';
import type { CategoryNode, LocalFilters } from '../types.js';

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

/**
 * Автокатегорія пошуку: категорія з найбільшою кількістю оголошень; нічия → менший categoryId.
 * Непорожній whitelist звужує вибір до своїх id; якщо жоден не зустрівся серед лічильників —
 * whitelist ігнорується (пошук з оголошеннями все одно отримує категорію).
 */
export function pickBaseCategory(
  counts: Array<{ categoryId: number; n: number }>,
  whitelist: number[],
): number | null {
  if (counts.length === 0) return null;
  const allowed = new Set(whitelist);
  const narrowed = allowed.size > 0 ? counts.filter((c) => allowed.has(c.categoryId)) : counts;
  const pool = narrowed.length > 0 ? narrowed : counts;
  let best = pool[0]!;
  for (const c of pool) {
    if (c.n > best.n || (c.n === best.n && c.categoryId < best.categoryId)) best = c;
  }
  return best.categoryId;
}

/** Ланцюжок предків від кореня до `id` включно; невідомий id → `[id]`. Захищено від циклів. */
export function ancestorIds(rows: CategoryNode[], id: number): number[] {
  const parentOf = new Map(rows.map((r) => [r.id, r.parentId]));
  const chain: number[] = [id];
  const seen = new Set<number>([id]);
  let parent = parentOf.get(id) ?? null;
  while (parent !== null && !seen.has(parent)) {
    chain.unshift(parent);
    seen.add(parent);
    parent = parentOf.get(parent) ?? null;
  }
  return chain;
}

/** `id` і всі його нащадки (обхід у ширину). */
export function descendantIds(rows: CategoryNode[], id: number): number[] {
  const children = new Map<number, number[]>();
  for (const r of rows) {
    if (r.parentId === null) continue;
    const list = children.get(r.parentId);
    if (list) list.push(r.id);
    else children.set(r.parentId, [r.id]);
  }
  const result = [id];
  const seen = new Set<number>([id]);
  for (let i = 0; i < result.length; i++) {
    for (const child of children.get(result[i]!) ?? []) {
      if (seen.has(child)) continue;
      seen.add(child);
      result.push(child);
    }
  }
  return result;
}

/**
 * Перераховує `searches.base_category_id` за оголошеннями пошуку. Один GROUP BY-читання;
 * запис — лише коли значення змінилось (Turso-економія). `local_filters.categories` — білий список
 * (з `invert.categories` — навпаки, виключення). `searches.category_id` (категорія скану) не чіпає.
 */
export async function refreshBaseCategory(searchId: number): Promise<number | null> {
  const search = await dbGet<{ local_filters: string | null; base_category_id: number | null }>(
    'SELECT local_filters, base_category_id FROM searches WHERE id = ?',
    [searchId],
  );
  if (!search) return null;

  let filters: LocalFilters = {};
  try {
    filters = JSON.parse(search.local_filters || '{}') as LocalFilters;
  } catch {
    filters = {};
  }
  const listed = Array.isArray(filters.categories) ? filters.categories : [];
  const inverted = filters.invert?.categories === true;

  const rows = await dbAll<{ category_id: number; n: number }>(
    `SELECT category_id, COUNT(*) AS n FROM listings
      WHERE search_id = ? AND category_id IS NOT NULL GROUP BY category_id`,
    [searchId],
  );
  const excluded = new Set(inverted ? listed : []);
  const counts = rows
    .filter((r) => !excluded.has(r.category_id))
    .map((r) => ({ categoryId: r.category_id, n: r.n }));

  const picked = pickBaseCategory(counts, inverted ? [] : listed);
  if (picked !== search.base_category_id) {
    await dbRun('UPDATE searches SET base_category_id = ? WHERE id = ?', [picked, searchId]);
  }
  return picked;
}
