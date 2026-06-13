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
  SearchStats,
  VerifyResult,
  NewSearchInput,
  AnalysisStatus,
  AnalysisCriteria,
  AnalysisMode,
  AnalyzeResponse,
  AnalyzedListing,
  PackagePart,
  CommitItem,
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
    mutationKey: ['scan'],
    mutationFn: ({ searchId, deep }: { searchId: number; deep?: boolean }) =>
      api<ScanResult>(`/api/searches/${searchId}/scan${deep ? '?deep=true' : ''}`, {
        method: 'POST',
      }),
    onSuccess: (_data, { searchId }) => {
      qc.invalidateQueries({ queryKey: ['listings', searchId] });
      qc.invalidateQueries({ queryKey: ['search-stats', searchId] });
    },
  });
}

/** Verify-прохід (A3): перевірка живості + дозаповнення опису/продавця для давно не бачених. */
export function useVerify() {
  const qc = useQueryClient();
  return useMutation({
    mutationKey: ['verify'],
    mutationFn: (searchId: number) =>
      api<VerifyResult>(`/api/searches/${searchId}/verify`, { method: 'POST' }),
    onSuccess: (_data, searchId) => {
      qc.invalidateQueries({ queryKey: ['listings', searchId] });
      qc.invalidateQueries({ queryKey: ['search-stats', searchId] });
    },
  });
}

/** Статистика для панелі дій: скільки в базі, скільки "давно не бачених", останній скан. */
export function useSearchStats(searchId: number | null) {
  return useQuery({
    queryKey: ['search-stats', searchId],
    queryFn: () => api<SearchStats>(`/api/searches/${searchId}/stats`),
    enabled: searchId != null,
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

// ── LLM-аналіз (план docs/plans/llm-analysis.md) ─────────────────────────────

/** Статус авто-режиму (наявність ключа OpenRouter) + дефолтна модель. */
export function useAnalysisStatus() {
  return useQuery({
    queryKey: ['analysis-status'],
    queryFn: () => api<AnalysisStatus>('/api/analysis/status'),
    staleTime: 5 * 60 * 1000,
  });
}

/** Збережені критерії пошуку (cons/pros). */
export function useSavedCriteria(searchId: number | null) {
  return useQuery({
    queryKey: ['criteria', searchId],
    queryFn: () => api<AnalysisCriteria>(`/api/searches/${searchId}/criteria`),
    enabled: searchId != null,
  });
}

/** Авто-генерація критеріїв (OpenRouter). */
export function useGenerateCriteria() {
  return useMutation({
    mutationFn: ({
      searchId,
      mode,
      sampleSize,
      model,
      reasoning,
      extra,
    }: {
      searchId: number;
      mode: AnalysisMode;
      sampleSize?: number;
      model?: string;
      reasoning?: boolean;
      extra?: string;
    }) =>
      api<{ criteria: string[] }>(`/api/searches/${searchId}/criteria/generate`, {
        method: 'POST',
        body: JSON.stringify({ mode, sampleSize, model, reasoning, extra }),
      }),
  });
}

/** Готовий промпт генерації критеріїв (ручний режим). */
export function fetchCriteriaPrompt(searchId: number, mode: AnalysisMode, extra?: string): Promise<{ prompt: string }> {
  const q = new URLSearchParams({ mode });
  if (extra) q.set('extra', extra);
  return api<{ prompt: string }>(`/api/searches/${searchId}/criteria/prompt?${q.toString()}`);
}

/** Парс вставленої відповіді з критеріями. */
export function useImportCriteria() {
  return useMutation({
    mutationFn: ({ searchId, mode, raw }: { searchId: number; mode: AnalysisMode; raw: string }) =>
      api<{ criteria: string[] }>(`/api/searches/${searchId}/criteria/import`, {
        method: 'POST',
        body: JSON.stringify({ mode, raw }),
      }),
  });
}

/** Зберегти обрані критерії пошуку. */
export function useSaveCriteria() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ searchId, cons, pros }: { searchId: number; cons?: string[]; pros?: string[] }) =>
      api<AnalysisCriteria>(`/api/searches/${searchId}/criteria`, {
        method: 'PUT',
        body: JSON.stringify({ cons, pros }),
      }),
    onSuccess: (_data, { searchId }) =>
      qc.invalidateQueries({ queryKey: ['criteria', searchId] }),
  });
}

/** Авто matching (чанки на сервері). НЕ пише в БД — повертає результат для перевірки. */
export function useAnalyze() {
  return useMutation({
    mutationFn: ({
      searchId,
      mode,
      ids,
      model,
      reasoning,
    }: {
      searchId: number;
      mode: AnalysisMode;
      ids: number[];
      model?: string;
      reasoning?: boolean;
    }) =>
      api<AnalyzeResponse>(`/api/searches/${searchId}/analyze`, {
        method: 'POST',
        body: JSON.stringify({ mode, ids, model, reasoning }),
      }),
  });
}

/** Ручний пакет(и) для безкоштовного чату (1 vs кілька частин). */
export function fetchAnalyzePackage(
  searchId: number,
  mode: AnalysisMode,
  ids: number[],
): Promise<{ parts: PackagePart[] }> {
  const q = new URLSearchParams({ mode });
  if (ids.length > 0) q.set('ids', ids.join(','));
  return api<{ parts: PackagePart[] }>(`/api/searches/${searchId}/analyze/package?${q.toString()}`);
}

/** Парс однієї вставленої відповіді matching + мерж у накопичене. */
export function useImportAnalysis() {
  return useMutation({
    mutationFn: ({
      searchId,
      mode,
      raw,
      accumulated,
    }: {
      searchId: number;
      mode: AnalysisMode;
      raw: string;
      accumulated: AnalyzedListing[];
    }) =>
      api<AnalyzeResponse>(`/api/searches/${searchId}/analyze/import`, {
        method: 'POST',
        body: JSON.stringify({ mode, raw, accumulated }),
      }),
  });
}

/** Запис результату аналізу у БД (chunked з боку клієнта). */
export function useCommitAnalysis() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      mode,
      items,
      model,
      source,
    }: {
      searchId: number;
      mode: AnalysisMode;
      items: CommitItem[];
      model?: string;
      source: 'api' | 'import';
    }) =>
      api<{ updated: number }>('/api/listings/analyze/commit', {
        method: 'POST',
        body: JSON.stringify({ mode, items, model, source }),
      }),
    onSuccess: (_data, { searchId }) =>
      qc.invalidateQueries({ queryKey: ['listings', searchId] }),
  });
}

/** Завантажує файл експорту превʼю (xlsx | json) через blob. */
export async function exportPreview(
  searchId: number,
  mode: AnalysisMode,
  format: 'xlsx' | 'json',
  rows: { title: string; description: string; criteria: string[] }[],
): Promise<void> {
  const res = await fetch(`/api/searches/${searchId}/analyze/export`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ format, mode, rows }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `analysis-${mode}.${format}`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
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
