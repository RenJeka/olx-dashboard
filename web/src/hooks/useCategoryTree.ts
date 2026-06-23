import { useMemo } from 'react';
import { useListings } from '../api';
import {
  buildCategoryCountMap,
  buildCategoryTree,
  countUncategorized,
  type CategoryTreeNode,
} from '../utils/categoryCounts';
import type { CategoryOption } from '../types';

/**
 * Будує вкладене дерево категорій + лічильники В ПАМ'ЯТІ з уже завантажених listings
 * (0 додаткових запитів до БД; читає кеш TanStack Query). Рендериться рекурсивно зі
 * згортанням гілок. Див. docs/plans/category-counts-and-filter.md.
 */
export function useCategoryTree(
  searchId: number,
  categories: CategoryOption[],
): {
  tree: CategoryTreeNode[];
  uncategorized: number;
  /** Усього завантажених оголошень пошуку (база лічильника «скільки покаже таблиця»). */
  total: number;
  /** category_id → к-сть оголошень (для живого лічильника вибору). */
  countMap: Map<number, number>;
} {
  const { data: listings } = useListings(searchId);

  return useMemo(() => {
    const all = listings ?? [];
    const countMap = buildCategoryCountMap(all);
    const tree = buildCategoryTree(categories, countMap);
    return { tree, uncategorized: countUncategorized(all), total: all.length, countMap };
  }, [listings, categories]);
}
