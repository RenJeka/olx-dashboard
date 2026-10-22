import { useMemo } from 'react';
import {
  buildCategoryCountMap,
  buildCategoryTree,
  countOutsideTree,
  countUncategorized,
  type CategoryTreeNode,
} from '../utils/categoryCounts';
import type { CategoryOption, Listing } from '../types';

/**
 * Будує вкладене дерево категорій + лічильники В ПАМ'ЯТІ (0 додаткових запитів до БД).
 * `listings` — уже відфільтровані: ті, що покаже таблиця з поточними (незбереженими) фільтрами без
 * групи «Категорії» й з перемикачами шуму (рахує SearchFiltersDrawer). Тож число біля вузла = скільки
 * покаже таблиця, якщо обрати саме його. Див. docs/plans/category-filter-counts.md.
 */
export function useCategoryTree(
  listings: Listing[],
  categories: CategoryOption[],
): { tree: CategoryTreeNode[]; uncategorized: number; outsideTree: number } {
  return useMemo(() => {
    const countMap = buildCategoryCountMap(listings);
    const tree = buildCategoryTree(categories, countMap);
    return {
      tree,
      uncategorized: countUncategorized(listings),
      outsideTree: countOutsideTree(listings, categories),
    };
  }, [listings, categories]);
}
