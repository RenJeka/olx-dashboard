import type { CategoryOption, Listing } from '../types';

/**
 * Лічильники категорій рахуються В ПАМ'ЯТІ з уже завантаженого масиву listings —
 * 0 додаткових запитів до БД (фронт і так тримає всі оголошення пошуку).
 * Масив сюди приходить УЖЕ відфільтрований (видимі в таблиці без урахування фільтра категорій —
 * `previewHideReason` + `withoutCategoryFilter`), тож без обраних категорій сума коренів +
 * «Без категорії» + «Інші категорії» = «Всього». Див. docs/plans/old/category-filter-counts.md.
 */

/** Вузол дерева категорій для фільтра (один сегмент шляху). */
export interface CategoryTreeNode {
  /** Унікальний ключ вузла — join префікса шляху (напр. "Електроніка / Телефони"). */
  key: string;
  /** Назва сегмента цього рівня. */
  label: string;
  /** Глибина (0 — коренева категорія). */
  depth: number;
  /** category id цього вузла. */
  id: number;
  /** Усі category id, що проходять через цей вузол (сам + нащадки) — для вибору «вся гілка». */
  leafIds: number[];
  /** Скільки оголошень покаже таблиця, якщо обрати цей вузол (сума по leafIds з переданого масиву). */
  shownCount: number;
  /** Лічильник OLX для цього вузла (включно з підкатегоріями — як віддає facet). */
  olxCount: number;
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
 * Скільки оголошень мають категорію, якої немає в дереві фільтра (дерево — кешований facet OLX за
 * основним запитом). Обрати їх у дереві не можна, але в «Всього» без обраних категорій вони входять.
 */
export function countOutsideTree(listings: Listing[], options: CategoryOption[]): number {
  const treeIds = new Set(options.map((o) => o.id));
  let n = 0;
  for (const l of listings) if (l.category_id != null && !treeIds.has(l.category_id)) n++;
  return n;
}

/**
 * Будує дерево категорій із facet-списку `CategoryOption` (шлях назв + OLX-лічильник) і
 * `countMap` (listings.category_id → к-сть). Для кожного вузла:
 * - `olxCount` — власний лічильник facet (вже включає підкатегорії, як віддає OLX);
 * - `shownCount` — сума оголошень з `countMap` у вузлі та всіх підкатегоріях (по `leafIds`).
 * Дочірні вузли сортуються за спаданням OLX-лічильника, тоді за назвою.
 */
export function buildCategoryTree(
  options: CategoryOption[],
  countMap: Map<number, number>,
): CategoryTreeNode[] {
  const roots: CategoryTreeNode[] = [];
  const nodeByKey = new Map<string, CategoryTreeNode>();

  for (const opt of options) {
    let prefix = '';
    let siblings = roots;
    for (let depth = 0; depth < opt.path.length; depth++) {
      const seg = opt.path[depth] ?? String(opt.id);
      prefix = prefix ? `${prefix} / ${seg}` : seg;
      let node = nodeByKey.get(prefix);
      if (!node) {
        node = { key: prefix, label: seg, depth, id: 0, leafIds: [], shownCount: 0, olxCount: 0, children: [] };
        nodeByKey.set(prefix, node);
        siblings.push(node);
      }
      node.leafIds.push(opt.id);
      // Власний вузол опції (останній сегмент шляху) — звідси беремо id та OLX-лічильник.
      if (depth === opt.path.length - 1) {
        node.id = opt.id;
        node.olxCount = opt.olxCount;
      }
      siblings = node.children;
    }
  }

  const finalize = (nodes: CategoryTreeNode[]): void => {
    for (const n of nodes) {
      n.leafIds = [...new Set(n.leafIds)];
      n.shownCount = n.leafIds.reduce((sum, id) => sum + (countMap.get(id) ?? 0), 0);
      finalize(n.children);
    }
  };
  finalize(roots);

  const sortRec = (nodes: CategoryTreeNode[]): void => {
    nodes.sort((a, b) => b.olxCount - a.olxCount || a.label.localeCompare(b.label, 'uk'));
    for (const n of nodes) sortRec(n.children);
  };
  sortRec(roots);
  return roots;
}

/**
 * Стан чекбокса вузла за поточним вибором: усі листи обрані → `true`,
 * частина → `'indeterminate'`, жодного → `false`.
 */
export function nodeCheckedState(
  node: CategoryTreeNode,
  selected: Set<number>,
): boolean | 'indeterminate' {
  if (node.leafIds.every((id) => selected.has(id))) return true;
  return node.leafIds.some((id) => selected.has(id)) ? 'indeterminate' : false;
}

/** Ключі всіх вузлів-гілок дерева (з дітьми) — для «Згорнути все». */
export function collectBranchKeys(nodes: CategoryTreeNode[], out: string[] = []): string[] {
  for (const n of nodes) {
    if (n.children.length === 0) continue;
    out.push(n.key);
    collectBranchKeys(n.children, out);
  }
  return out;
}
