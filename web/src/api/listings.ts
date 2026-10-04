import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from './base';
import type { Listing, ListingDetails, ListingPatch, FilterOptions } from '../types';

export function useListings(searchId: number | null) {
  return useQuery({
    queryKey: ['listings', searchId],
    queryFn: () => api<Listing[]>(`/api/searches/${searchId}/listings`),
    enabled: searchId != null,
  });
}

/** Повний опис і галерея одного оголошення — на вимогу (підказка, діалог, галерея). */
export function useListingDetails(id: number | null) {
  return useQuery({
    queryKey: ['listing-details', id],
    queryFn: () => api<ListingDetails>(`/api/listings/${id}/details`),
    enabled: id != null,
    staleTime: Infinity,
  });
}

/** Скільки id в одному запиті деталей (ліміт сервера — DETAILS_MAX_IDS). */
const DETAILS_CHUNK = 500;

/** Те саме пакетом (крок перегляду AI-майстра) → Map id → деталі; великий набір — кількома запитами. */
export function useListingsDetails(searchId: number | null, ids: number[]) {
  return useQuery({
    queryKey: ['listings-details', searchId, ids],
    queryFn: async () => {
      const chunks: number[][] = [];
      for (let i = 0; i < ids.length; i += DETAILS_CHUNK) chunks.push(ids.slice(i, i + DETAILS_CHUNK));
      const parts = await Promise.all(
        chunks.map((chunk) =>
          api<ListingDetails[]>(`/api/searches/${searchId}/listings/details`, {
            method: 'POST',
            body: JSON.stringify({ ids: chunk }),
          }),
        ),
      );
      return new Map(parts.flat().map((d) => [d.id, d]));
    },
    enabled: searchId != null && ids.length > 0,
    staleTime: Infinity,
  });
}

/**
 * Пошук у назві/описі на сервері (опис не приходить на клієнт) → множина id збігів.
 * `query` — уже з паузою після набору; поки йде новий запит, лишаються попередні збіги.
 */
export function useListingSearch(
  searchId: number | null,
  query: string,
  scope: { inTitle: boolean; inDescription: boolean },
) {
  const q = query.trim();
  return useQuery({
    queryKey: ['listing-search', searchId, q, scope.inTitle, scope.inDescription],
    queryFn: async () => {
      const params = new URLSearchParams({
        q,
        title: scope.inTitle ? '1' : '0',
        description: scope.inDescription ? '1' : '0',
      });
      const { ids } = await api<{ ids: number[] }>(
        `/api/searches/${searchId}/listings/search?${params}`,
      );
      return new Set(ids);
    },
    enabled: searchId != null && q !== '' && scope.inDescription,
    placeholderData: (prev) => prev,
    staleTime: 60_000,
  });
}

interface UpdateListingVars {
  id: number;
  searchId: number;
  patch: ListingPatch;
}

/** PATCH /api/listings/:id зі оптимістичним апдейтом кешу ['listings', searchId]. */
export function useUpdateListing() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: UpdateListingVars) =>
      api<Listing>(`/api/listings/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(patch),
      }),
    onMutate: async ({ id, searchId, patch }: UpdateListingVars) => {
      const queryKey = ['listings', searchId];
      await qc.cancelQueries({ queryKey });
      const previous = qc.getQueryData<Listing[]>(queryKey);
      qc.setQueryData<Listing[]>(queryKey, (old) =>
        old?.map((listing) =>
          listing.id === id
            ? {
                ...listing,
                ...patch,
                status_source: patch.status !== undefined ? 'manual' : listing.status_source,
                miss_count: patch.status !== undefined ? 0 : listing.miss_count,
              }
            : listing,
        ),
      );
      return { previous, queryKey };
    },
    onError: (_err, _vars, context) => {
      if (context) qc.setQueryData(context.queryKey, context.previous);
    },
    // Точкове оновлення кешу відповіддю сервера (авторитетні поля: status_source,
    // miss_count тощо) БЕЗ invalidate — інакше повний рефетч списку «перевантажує»
    // таблицю й скидає позицію скролу/порядок рядків. Рядок оновлюється на місці,
    // тому сортування та позиція користувача зберігаються.
    onSuccess: (updated, { id, searchId }) => {
      qc.setQueryData<Listing[]>(['listings', searchId], (old) =>
        old?.map((listing) => (listing.id === id ? updated : listing)),
      );
    },
  });
}

/** Варіанти для фільтрів "Місто"/"Продавець" у Drawer локальних фільтрів. */
export function useFilterOptions(searchId: number, enabled: boolean) {
  return useQuery({
    queryKey: ['filter-options', searchId],
    queryFn: () => api<FilterOptions>(`/api/searches/${searchId}/filter-options`),
    enabled,
  });
}
