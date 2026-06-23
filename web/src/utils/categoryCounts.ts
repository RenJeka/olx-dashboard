import type { CategoryOption, Listing } from '../types';

/**
 * Лічильники категорій рахуються В ПАМ'ЯТІ з уже завантаженого масиву listings —
 * 0 додаткових запитів до БД (фронт і так тримає всі оголошення пошуку).
 * Див. docs/plans/category-counts-and-filter.md (відповідь на питання «скільки зчитувань»).
 */

/** Вузол дерева категорій для фільтра (один сегмент шляху). */
export interface CategoryTreeNode {
  /** Унікальний ключ вузла — join префікса шляху (напр. "Електроніка / Телефони"). */
  key: string;
  /** Назва сегмента цього рівня. */
  label: string;
  /** Глибина (0 — коренева категорія). */
  depth: number;
  /** Усі листові category_id, що проходять через цей вузол (для вибору «вся гілка»). */
  leafIds: number[];
  /** Сума оголошень у всіх листах цього вузла. */
  count: number;
  children: CategoryTreeNode[];
}

/** Map listings.category_id → кількість оголошень (один O(n) прохід; null-категорії пропускаються). */
export function buildCategoryCountMap(listings: Listing[]): Map<number, number> {
  const counts = new Map<number, number>();
  for (const l of listings) {
    if (l.category_id == null) continue;
    counts.set(l.category_id, (counts.get(l.category_id) ?? 0) + 1);
  }
  return counts;
}

/** Скільки оголошень пошуку ще без категорії (старі рядки до re-scan). */
export function countUncategorized(listings: Listing[]): number {
  let n = 0;
  for (const l of listings) if (l.category_id == null) n++;
  return n;
}

/**
 * Будує дерево категорій із плоского списку `CategoryOption` (шлях назв) + лічильників.
 * Дочірні вузли сортуються за спаданням лічильника, тоді за назвою.
 */
export function buildCategoryTree(
  options: CategoryOption[],
  countMap: Map<number, number>,
): CategoryTreeNode[] {
  const roots: CategoryTreeNode[] = [];
  const nodeByKey = new Map<string, CategoryTreeNode>();

  for (const opt of options) {
    const count = countMap.get(opt.id) ?? 0;
    let prefix = '';
    let siblings = roots;
    for (let depth = 0; depth < opt.path.length; depth++) {
      const seg = opt.path[depth] ?? String(opt.id);
      prefix = prefix ? `${prefix} / ${seg}` : seg;
      let node = nodeByKey.get(prefix);
      if (!node) {
        node = { key: prefix, label: seg, depth, leafIds: [], count: 0, children: [] };
        nodeByKey.set(prefix, node);
        siblings.push(node);
      }
      node.leafIds.push(opt.id);
      node.count += count;
      siblings = node.children;
    }
  }

  const sortRec = (nodes: CategoryTreeNode[]): void => {
    nodes.sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, 'uk'));
    for (const n of nodes) sortRec(n.children);
  };
  sortRec(roots);
  return roots;
}

/** Плаский pre-order обхід дерева (для рендеру списку з відступами за depth). */
export function flattenTree(nodes: CategoryTreeNode[]): CategoryTreeNode[] {
  const out: CategoryTreeNode[] = [];
  const walk = (list: CategoryTreeNode[]): void => {
    for (const n of list) {
      out.push(n);
      walk(n.children);
    }
  };
  walk(nodes);
  return out;
}
