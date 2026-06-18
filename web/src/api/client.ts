import {
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { downloadBlob } from '../utils/download';
import type {
  Search,
  Listing,
  ListingPatch,
  LocalFilters,
  FilterOptions,
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
  CommitItem,
  PickItem,
  PickResult,
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

/** Розподіл ключів params цього пошуку — для дропдауна конструктора діапазонів. */
// ── Заплановано на майбутнє (закомментовано разом з UI діапазонів params) ────
// export function useParamKeys(searchId: number, enabled: boolean) {
//   return useQuery({
//     queryKey: ['param-keys', searchId],
//     queryFn: () => api<ParamKeyInfo[]>(`/api/searches/${searchId}/param-keys`),
//     enabled,
//   });
// }

/** Варіанти для фільтрів "Місто"/"Продавець" у Drawer локальних фільтрів. */
export function useFilterOptions(searchId: number, enabled: boolean) {
  return useQuery({
    queryKey: ['filter-options', searchId],
    queryFn: () => api<FilterOptions>(`/api/searches/${searchId}/filter-options`),
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

/** Завантажує ZIP-пакет ручного режиму (prompt.txt + descriptions/chunk-NNN.json) через blob. */
export async function fetchAnalyzePackageZip(
  searchId: number,
  mode: AnalysisMode,
  ids: number[],
): Promise<void> {
  // POST (не GET): тисячі ids у query-рядку перевищують ліміт довжини заголовків (431).
  const res = await fetch(`/api/searches/${searchId}/analyze/package.zip`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ mode, ids }),
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? `HTTP ${res.status}`);
  }
  downloadBlob(await res.blob(), `analysis-${mode}-search-${searchId}.zip`);
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
      merge,
    }: {
      searchId: number;
      mode: AnalysisMode;
      items: CommitItem[];
      model?: string;
      source: 'api' | 'import';
      merge: 'append' | 'replace';
    }) =>
      api<{ updated: number }>('/api/listings/analyze/commit', {
        method: 'POST',
        body: JSON.stringify({ mode, items, model, source, merge }),
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
  downloadBlob(await res.blob(), `analysis-${mode}.${format}`);
}

// ── AI Вибір позицій ──────────────────────────────────────────────────────────

/** Готовий промпт для ручного AI-ранжування. */
export function fetchAiPicksPrompt(searchId: number): Promise<{ prompt: string }> {
  return api<{ prompt: string }>(`/api/searches/${searchId}/ai-picks/prompt`);
}

/** ZIP-пакет ручного режиму для великих пулів (prompt.txt + candidates/chunk-NNN.json) через blob. */
export async function fetchAiPicksPackageZip(searchId: number): Promise<void> {
  const res = await fetch(`/api/searches/${searchId}/ai-picks/package.zip`);
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? `HTTP ${res.status}`);
  }
  downloadBlob(await res.blob(), `ai-picks-search-${searchId}.zip`);
}

/** Авто-ранжування через OpenRouter. НЕ пише в БД — повертає picks для перегляду. */
export function useRunAiPicks() {
  return useMutation({
    mutationFn: ({ searchId, model }: { searchId: number; model?: string }) =>
      api<PickResult>(`/api/searches/${searchId}/ai-picks/rank`, {
        method: 'POST',
        body: JSON.stringify({ model }),
      }),
  });
}

/** Парс ручної відповіді. НЕ пише в БД — повертає picks для перегляду. */
export function useImportAiPicks() {
  return useMutation({
    mutationFn: ({ searchId, raw }: { searchId: number; raw: string }) =>
      api<PickResult>(`/api/searches/${searchId}/ai-picks/import`, {
        method: 'POST',
        body: JSON.stringify({ raw }),
      }),
  });
}

/** Запис AI-picks у БД. Інвалідує кеш listings. */
export function useCommitAiPicks() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ searchId, picks }: { searchId: number; picks: PickItem[] }) =>
      api<{ committed: number }>(`/api/searches/${searchId}/ai-picks/commit`, {
        method: 'POST',
        body: JSON.stringify({ picks }),
      }),
    onSuccess: (_data, { searchId }) =>
      qc.invalidateQueries({ queryKey: ['listings', searchId] }),
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
