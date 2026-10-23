/**
 * Глобальне дерево категорій OLX (таблиця `olx_categories`), що накопичується зі скану пошуків
 * і збирача (docs/plans/old/base-criteria.md).
 */
import {
  countListingsByCategory,
  getSearchCategoryState,
  listCategoryRowsByIds,
  setSearchBaseCategory,
  upsertCategoryRows,
  type CategoryRow,
} from '../db/repos/categories.js';
import { parseLocalFilters } from '../scraper/localFilters.js';
import type { CategoryNode } from '../types.js';

/** Розмір чанка id у `SELECT … WHERE id IN (…)` (ліміт SQLite на змінні). */
const SELECT_CHUNK = 400;

/**
 * Upsert вузлів дерева. Рядок пишеться лише якщо він новий або змінився хоч одним полем
 * (Turso-економія: повторний скан того самого дерева — 0 записів). Повертає кількість нових/змінених.
 * Читає лише рядки з вхідних id. Вхідний `parentId=null` (facet без предка) не затирає збережений parent_id.
 */
export async function upsertCategories(nodes: CategoryNode[]): Promise<number> {
  if (nodes.length === 0) return 0;

  // Turso-економія: читаємо лише рядки, чиї id є у вхідному наборі (а не всю таблицю).
  const ids = [...new Set(nodes.map((n) => n.id))];
  const before = new Map<number, CategoryRow>();
  for (let i = 0; i < ids.length; i += SELECT_CHUNK) {
    for (const r of await listCategoryRowsByIds(ids.slice(i, i + SELECT_CHUNK))) before.set(r.id, r);
  }

  // Вхідний parentId=null (facet без предка) не затирає збережений непорожній parent_id.
  const changed = nodes.filter((n) => {
    const old = before.get(n.id);
    if (!old) return true;
    const parentChanged = n.parentId !== null && old.parent_id !== n.parentId;
    return parentChanged || old.label !== n.label || old.slug !== n.slug;
  });
  if (changed.length === 0) return 0;

  await upsertCategoryRows(changed);
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
  const search = await getSearchCategoryState(searchId);
  if (!search) return null;

  const filters = parseLocalFilters(search.local_filters);
  const listed = Array.isArray(filters.categories) ? filters.categories : [];
  const inverted = filters.invert?.categories === true;

  const rows = await countListingsByCategory(searchId);
  const excluded = new Set(inverted ? listed : []);
  const counts = rows
    .filter((r) => !excluded.has(r.category_id))
    .map((r) => ({ categoryId: r.category_id, n: r.n }));

  const picked = pickBaseCategory(counts, inverted ? [] : listed);
  if (picked !== search.base_category_id) {
    await setSearchBaseCategory(searchId, picked);
  }
  return picked;
}
