import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { api } from './base';
import type {
  AnalysisMode,
  CategoryCriteriaResponse,
  CategoryRemapResult,
  CollectCategoriesResult,
  CriteriaConfig,
  CriterionGroup,
  OlxCategoryItem,
} from '../types';

// Дерево категорій OLX і базові набори плюсів/мінусів (docs/plans/base-criteria.md).

const CATEGORIES_KEY = ['categories'] as const;
const categoryCriteriaKey = (categoryId: number) => ['category-criteria', categoryId] as const;

/** Дерево категорій (плоский список з parentId) + позначка «є набір». Змінюється рідко — без частих перезапитів. */
export function useOlxCategories(enabled = true) {
  return useQuery({
    queryKey: CATEGORIES_KEY,
    queryFn: () => api<OlxCategoryItem[]>('/api/categories'),
    staleTime: 5 * 60 * 1000,
    enabled,
  });
}

/** Власний набір категорії + успадковані від предків (лише перегляд). */
export function useCategoryCriteria(categoryId: number | null) {
  return useQuery({
    queryKey: ['category-criteria', categoryId],
    queryFn: () => api<CategoryCriteriaResponse>(`/api/categories/${categoryId}/criteria`),
    enabled: categoryId != null,
  });
}

/**
 * Після зміни набору категорії: свій набір — у кеш із відповіді; позначка «є набір» у дереві — локально (без
 * перечитування всього дерева з Turso); успадковане в інших категоріях (неактивні запити лише стають
 * застарілими — без зайвих читань) і базові пункти в усіх пошуках (`['criteria', …]`).
 */
function applyOwnSet(qc: QueryClient, categoryId: number, own: CriteriaConfig) {
  qc.setQueryData<CategoryCriteriaResponse>(categoryCriteriaKey(categoryId), (prev) => (prev ? { ...prev, own } : prev));
  const hasSet = own.cons.length + own.pros.length > 0;
  qc.setQueryData<OlxCategoryItem[]>(CATEGORIES_KEY, (prev) =>
    prev?.map((c) => (c.id === categoryId && c.hasSet !== hasSet ? { ...c, hasSet } : c)),
  );
  void qc.invalidateQueries({
    queryKey: ['category-criteria'],
    predicate: (q) => q.queryKey[1] !== categoryId,
  });
  void qc.invalidateQueries({ queryKey: ['criteria'] });
}

/** Зберегти власний набір режиму цілком (PUT). Оголошень не чіпає. */
export function useSaveCategoryCriteria() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      categoryId,
      cons,
      pros,
    }: {
      categoryId: number;
      cons?: CriterionGroup[];
      pros?: CriterionGroup[];
    }) =>
      api<CriteriaConfig>(`/api/categories/${categoryId}/criteria`, {
        method: 'PUT',
        body: JSON.stringify({ cons, pros }),
      }),
    onSuccess: (own, { categoryId }) => applyOwnSet(qc, categoryId, own),
  });
}

/**
 * Перейменувати / об'єднати (`to` — назва) або видалити (`to = null`) власний пункт категорії. Сервер переписує
 * пункти в оголошеннях пошуків цієї категорії та її підкатегорій (видалення оголошень не чіпає).
 */
export function useRemapCategoryCriteria() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      categoryId,
      mode,
      from,
      to,
    }: {
      categoryId: number;
      mode: AnalysisMode;
      from: string[];
      to: string | null;
    }) =>
      api<CategoryRemapResult>(`/api/categories/${categoryId}/criteria/remap`, {
        method: 'POST',
        body: JSON.stringify({ mode, from, to }),
      }),
    onSuccess: (res, { categoryId }) => {
      applyOwnSet(qc, categoryId, res.criteria);
      // Змінились пункти в оголошеннях — перечитати лише тоді (Turso-економія).
      if (res.updated > 0) {
        void qc.invalidateQueries({ queryKey: ['listings'] });
        void qc.invalidateQueries({ queryKey: ['filter-options'] });
        void qc.invalidateQueries({ queryKey: ['searches'] });
      }
    },
  });
}

/** Чернетка набору від LLM (платний виклик — лише за кнопкою). НЕ зберігає. */
export function useGenerateCategoryCriteria() {
  return useMutation({
    mutationFn: ({
      categoryId,
      mode,
      model,
      reasoning,
    }: {
      categoryId: number;
      mode: AnalysisMode;
      model?: string;
      reasoning?: boolean;
    }) =>
      api<{ criteria: string[] }>(`/api/categories/${categoryId}/criteria/generate`, {
        method: 'POST',
        body: JSON.stringify({ mode, model, reasoning }),
      }),
  });
}

/** Зібрати дерево категорій з OLX (синхронно, близько хвилини; паралельний запуск → 409). */
export function useCollectCategories() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api<CollectCategoriesResult>('/api/categories/collect', { method: 'POST' }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: CATEGORIES_KEY }),
  });
}
