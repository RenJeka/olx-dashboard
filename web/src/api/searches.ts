import { useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from './base';
import { useListings } from './listings';
import { computeListingStats } from '../utils/searchStats';
import type {
  Search,
  SearchStats,
  LastScanResponse,
  NewSearchInput,
  SearchPatchResult,
  LocalFilters,
} from '../types';

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
          query_synonyms: input.querySynonyms ?? [],
          project_id: input.projectId,
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

/**
 * Статистика для панелі дій. `last_scan` — зі звуженого `/stats` (1 рядок scan_runs); агрегати
 * `in_db`/`stale_count`/`verify_candidates` рахуються на клієнті з кешу `['listings', searchId]`
 * (`useListings` дедуплікується з таблицею — зайвого запиту немає), щоб не робити 408-рядковий
 * прохід на сервері. docs/plans/turso-stats-clientside.md.
 */
export function useSearchStats(searchId: number | null) {
  const lastScanQuery = useQuery({
    queryKey: ['search-stats', searchId],
    queryFn: () => api<LastScanResponse>(`/api/searches/${searchId}/stats`),
    enabled: searchId != null,
  });

  const { data: listings } = useListings(searchId);
  const derived = useMemo(() => computeListingStats(listings), [listings]);

  const data: SearchStats | undefined = lastScanQuery.data
    ? { ...derived, last_scan: lastScanQuery.data.last_scan }
    : undefined;

  return { ...lastScanQuery, data };
}

/** Загальне редагування пошуку (назва/запит/api_filters/синоніми) — docs/plans/search-row-edit.md. */
export function useUpdateSearch() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      searchId,
      name,
      query,
      api_filters,
      query_synonyms,
    }: {
      searchId: number;
      name?: string;
      query?: string;
      api_filters?: unknown;
      query_synonyms?: string[];
    }) =>
      api<Search>(`/api/searches/${searchId}`, {
        method: 'PATCH',
        body: JSON.stringify({ name, query, api_filters, query_synonyms }),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['searches'] }),
  });
}

/** Архівувати/розархівувати пошук (docs/plans/archive-searches.md). */
export function useArchiveSearch() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ searchId, archived }: { searchId: number; archived: boolean }) =>
      api<Search>(`/api/searches/${searchId}`, {
        method: 'PATCH',
        body: JSON.stringify({ archived: archived ? 1 : 0 }),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['searches'] }),
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
