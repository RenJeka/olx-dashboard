import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, apiBlob } from './base';
import { downloadBlob } from '../utils/download';
import type {
  AnalysisStatus,
  AnalysisEngine,
  AnalysisMode,
  AnalyzeResponse,
  AnalyzedListing,
  CommitItem,
  CriteriaConfig,
  CriterionGroup,
  RemapCriteriaResult,
} from '../types';

/** Статус авто-режиму (наявність ключа OpenRouter) + дефолтна модель. */
export function useAnalysisStatus() {
  return useQuery({
    queryKey: ['analysis-status'],
    queryFn: () => api<AnalysisStatus>('/api/analysis/status'),
    staleTime: 5 * 60 * 1000,
  });
}

/** Категорії критеріїв пошуку (cons/pros; docs/plans/criteria-categories.md). */
export function useSavedCriteria(searchId: number | null) {
  return useQuery({
    queryKey: ['criteria', searchId],
    queryFn: () => api<CriteriaConfig>(`/api/searches/${searchId}/criteria`),
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

/** Зберегти список категорій режиму цілком (вмик/вимк, додані, вийнятий синонім). Оголошень не чіпає. */
export function useSaveCriteria() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ searchId, cons, pros }: { searchId: number; cons?: CriterionGroup[]; pros?: CriterionGroup[] }) =>
      api<CriteriaConfig>(`/api/searches/${searchId}/criteria`, {
        method: 'PUT',
        body: JSON.stringify({ cons, pros }),
      }),
    onSuccess: (data, { searchId }) => qc.setQueryData(['criteria', searchId], data),
  });
}

/**
 * Об'єднати / перейменувати (`to` — назва) або видалити (`to = null`) формулювання: категорії + пункти в
 * оголошеннях і локальних фільтрах (`listings: false` — видалити лише зі списку).
 */
export function useRemapCriteria() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      searchId,
      mode,
      from,
      to,
      listings,
    }: {
      searchId: number;
      mode: AnalysisMode;
      from: string[];
      to: string | null;
      listings?: boolean;
    }) =>
      api<RemapCriteriaResult>(`/api/searches/${searchId}/criteria/remap`, {
        method: 'POST',
        body: JSON.stringify({ mode, from, to, listings }),
      }),
    onSuccess: (data, { searchId }) => {
      qc.setQueryData(['criteria', searchId], data.criteria);
      qc.invalidateQueries({ queryKey: ['listings', searchId] });
      qc.invalidateQueries({ queryKey: ['filter-options', searchId] });
      qc.invalidateQueries({ queryKey: ['searches'] });
    },
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
      engine,
    }: {
      searchId: number;
      mode: AnalysisMode;
      ids: number[];
      model?: string;
      reasoning?: boolean;
      engine?: AnalysisEngine;
    }) =>
      api<AnalyzeResponse>(`/api/searches/${searchId}/analyze`, {
        method: 'POST',
        body: JSON.stringify({ mode, ids, model, reasoning, engine }),
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
  const blob = await apiBlob(`/api/searches/${searchId}/analyze/package.zip`, {
    method: 'POST',
    body: JSON.stringify({ mode, ids }),
  });
  downloadBlob(blob, `analysis-${mode}-search-${searchId}.zip`);
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
  rows: { id: number; criteria: string[] }[],
): Promise<void> {
  const blob = await apiBlob(`/api/searches/${searchId}/analyze/export`, {
    method: 'POST',
    body: JSON.stringify({ format, mode, rows }),
  });
  downloadBlob(blob, `analysis-${mode}.${format}`);
}
