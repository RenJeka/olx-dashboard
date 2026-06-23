import { useMemo } from 'react';
import { useListings } from '../api';
import {
  buildCategoryCountMap,
  buildCategoryTree,
  countUncategorized,
  flattenTree,
  type CategoryTreeNode,
} from '../utils/categoryCounts';
import type { CategoryOption } from '../types';

/**
 * Будує плаский список вузлів дерева категорій + лічильники В ПАМ'ЯТІ з уже завантажених
 * listings (0 додаткових запитів до БД; читає кеш TanStack Query). Див.
 * docs/plans/category-counts-and-filter.md.
 */
export function useCategoryTree(
  searchId: number,
  categories: CategoryOption[],
): { rows: CategoryTreeNode[]; uncategorized: number } {
  const { data: listings } = useListings(searchId);

  return useMemo(() => {
    const all = listings ?? [];
    const countMap = buildCategoryCountMap(all);
    const rows = flattenTree(buildCategoryTree(categories, countMap));
    return { rows, uncategorized: countUncategorized(all) };
  }, [listings, categories]);
}
