import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from './base';
import type { Listing, ListingPatch, FilterOptions } from '../types';

export function useListings(searchId: number | null) {
  return useQuery({
    queryKey: ['listings', searchId],
    queryFn: () => api<Listing[]>(`/api/searches/${searchId}/listings`),
    enabled: searchId != null,
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
