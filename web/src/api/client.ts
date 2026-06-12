import {
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import type {
  Search,
  Listing,
  ListingPatch,
  LocalFilters,
  ParamKeyInfo,
  ScanResult,
  ScanStatus,
  SearchPatchResult,
  NewSearchInput,
} from '../types';

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  // Content-Type ставимо лише коли є тіло — інакше Fastify відхиляє порожнє JSON-тіло.
  const headers = init?.body ? { 'Content-Type': 'application/json' } : undefined;
  const res = await fetch(path, { headers, ...init });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? `HTTP ${res.status}`);
  }
  return res.json() as Promise<T>;
}

export function useSearches() {
  return useQuery({
    queryKey: ['searches'],
    queryFn: () => api<Search[]>('/api/searches'),
  });
}

export function useCreateSearch() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: NewSearchInput) => {
      const ranges: Record<string, { from?: number; to?: number }> = {};
      if (input.priceFrom != null || input.priceTo != null) {
        ranges.price = { from: input.priceFrom, to: input.priceTo };
      }
      return api<Search>('/api/searches', {
        method: 'POST',
        body: JSON.stringify({
          name: input.name,
          query: input.query,
          api_filters: { ranges },
        }),
      });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['searches'] }),
  });
}

export function useDeleteSearch() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (searchId: number) =>
      api<{ deleted: boolean }>(`/api/searches/${searchId}`, { method: 'DELETE' }),
    onSuccess: (_data, searchId) => {
      qc.invalidateQueries({ queryKey: ['searches'] });
      qc.removeQueries({ queryKey: ['listings', searchId] });
    },
  });
}

export function useReorderSearches() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ searchId, direction }: { searchId: number; direction: 'up' | 'down' }) =>
      api<Search>(`/api/searches/${searchId}/move`, {
        method: 'POST',
        body: JSON.stringify({ direction }),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['searches'] }),
  });
}

export function useScan() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ searchId, deep }: { searchId: number; deep?: boolean }) =>
      api<ScanResult>(`/api/searches/${searchId}/scan${deep ? '?deep=true' : ''}`, {
        method: 'POST',
      }),
    onSuccess: (_data, { searchId }) =>
      qc.invalidateQueries({ queryKey: ['listings', searchId] }),
  });
}

/** Поллінг прогресу глибокого скану (раз на ~1.5с, поки enabled). */
export function useScanStatus(searchId: number | null, enabled: boolean) {
  return useQuery({
    queryKey: ['scan-status', searchId],
    queryFn: () => api<ScanStatus>(`/api/searches/${searchId}/scan-status`),
    enabled: enabled && searchId != null,
    refetchInterval: 1500,
  });
}

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
    onSettled: (_data, _err, { searchId }) => {
      qc.invalidateQueries({ queryKey: ['listings', searchId] });
    },
  });
}

/** Розподіл ключів params цього пошуку — для дропдауна конструктора діапазонів. */
export function useParamKeys(searchId: number, enabled: boolean) {
  return useQuery({
    queryKey: ['param-keys', searchId],
    queryFn: () => api<ParamKeyInfo[]>(`/api/searches/${searchId}/param-keys`),
    enabled,
  });
}

/** PATCH local_filters → ретроактивний перерахунок filtered_out (повертає filtered_out_count). */
export function useUpdateSearchFilters() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ searchId, local_filters }: { searchId: number; local_filters: LocalFilters }) =>
      api<SearchPatchResult>(`/api/searches/${searchId}`, {
        method: 'PATCH',
        body: JSON.stringify({ local_filters }),
      }),
    onSuccess: (_data, { searchId }) => {
      qc.invalidateQueries({ queryKey: ['searches'] });
      qc.invalidateQueries({ queryKey: ['listings', searchId] });
    },
  });
}
