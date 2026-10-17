// Дерево категорій OLX для вікна «Базові плюси й мінуси» (docs/plans/base-criteria.md): будується на клієнті з
// плоского списку GET /api/categories (parentId).
import type { OlxCategoryItem } from '../types';

/** Запобіжник від циклів у даних (parentId вказує по колу) — глибше дерево OLX не буває. */
const MAX_DEPTH = 32;

export interface CategoryIndex {
  byId: Map<number, OlxCategoryItem>;
  /** Діти вузла за назвою (укр. колація); ключ `null` — корені (без батька або батька немає в списку). */
  children: Map<number | null, OlxCategoryItem[]>;
}

/** Рядок плаского показу дерева. */
export interface CategoryTreeRow {
  node: OlxCategoryItem;
  depth: number;
  hasChildren: boolean;
  expanded: boolean;
}

const byLabel = (a: OlxCategoryItem, b: OlxCategoryItem) => a.label.localeCompare(b.label, 'uk', { sensitivity: 'base' });

export function indexCategories(items: OlxCategoryItem[]): CategoryIndex {
  const byId = new Map(items.map((c) => [c.id, c]));
  const children = new Map<number | null, OlxCategoryItem[]>();
  for (const c of items) {
    const key = c.parentId !== null && byId.has(c.parentId) ? c.parentId : null;
    const list = children.get(key);
    if (list) list.push(c);
    else children.set(key, [c]);
  }
  for (const list of children.values()) list.sort(byLabel);
  return { byId, children };
}

/** Предки вузла від батька вгору до кореня (без самого вузла). */
export function ancestorIds(index: CategoryIndex, id: number): number[] {
  const out: number[] = [];
  let parent = index.byId.get(id)?.parentId ?? null;
  while (parent !== null && index.byId.has(parent) && out.length < MAX_DEPTH) {
    out.push(parent);
    parent = index.byId.get(parent)?.parentId ?? null;
  }
  return out;
}

/** Назви від кореня до вузла включно. */
export function categoryPath(index: CategoryIndex, id: number): string[] {
  const node = index.byId.get(id);
  if (!node) return [];
  const labels = ancestorIds(index, id)
    .map((a) => index.byId.get(a)?.label ?? '')
    .reverse();
  return [...labels, node.label];
}

/** Вузли, видимі за пошуком: збіги назви (без регістру) + їхні предки. */
export function visibleForQuery(index: CategoryIndex, query: string): Set<number> {
  const q = query.trim().toLowerCase();
  const visible = new Set<number>();
  for (const node of index.byId.values()) {
    if (!node.label.toLowerCase().includes(q)) continue;
    visible.add(node.id);
    for (const a of ancestorIds(index, node.id)) visible.add(a);
  }
  return visible;
}

/**
 * Плаский список рядків для показу. Без пошуку — розкриті лише вузли з `expanded`; з пошуком — лише збіги
 * та їхні предки, усі розкриті (діти збігу, що самі не збігаються, не показуються).
 */
export function flattenTree(index: CategoryIndex, expanded: Set<number>, query: string): CategoryTreeRow[] {
  const visible = query.trim() ? visibleForQuery(index, query) : null;
  const rows: CategoryTreeRow[] = [];
  const walk = (parent: number | null, depth: number) => {
    if (depth > MAX_DEPTH) return;
    for (const node of index.children.get(parent) ?? []) {
      if (visible && !visible.has(node.id)) continue;
      const kids = index.children.get(node.id) ?? [];
      const hasChildren = visible ? kids.some((k) => visible.has(k.id)) : kids.length > 0;
      const open = hasChildren && (visible !== null || expanded.has(node.id));
      rows.push({ node, depth, hasChildren, expanded: open });
      if (open) walk(node.id, depth + 1);
    }
  };
  walk(null, 0);
  return rows;
}
