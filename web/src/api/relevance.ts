import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, apiBlob } from './base';
import { downloadBlob } from '../utils/download';
import type { RelevanceItem, RelevanceResponse } from '../types';

/** Цільовий товар фільтра (передзаповнюється query, якщо ще не збережений). */
export function useRelevanceTarget(searchId: number | null) {
  return useQuery({
    queryKey: ['relevance-target', searchId],
    queryFn: () => api<{ target: string }>(`/api/searches/${searchId}/relevance/target`),
    enabled: searchId != null,
  });
}

/** Зберегти цільовий товар на рівні пошуку. */
export function useSaveRelevanceTarget() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ searchId, target }: { searchId: number; target: string }) =>
      api<{ target: string }>(`/api/searches/${searchId}/relevance/target`, {
        method: 'PUT',
        body: JSON.stringify({ target }),
      }),
    onSuccess: (_data, { searchId }) =>
      qc.invalidateQueries({ queryKey: ['relevance-target', searchId] }),
  });
}

/** Превʼю розбивки пре-фільтра: скільки піде в ШІ vs авто-відсіється (для UI перед запуском). */
export function useRelevancePreview(
  searchId: number,
  target: string,
  ids: number[],
  enabled: boolean,
) {
  return useQuery({
    // Ключ компактний: повний масив ids може бути великим — досить сигнатури scope.
    queryKey: ['relevance-preview', searchId, target, ids.length, ids[0] ?? null, ids[ids.length - 1] ?? null],
    queryFn: () =>
      api<{ total: number; candidates: number; autoRejected: number }>(
        `/api/searches/${searchId}/relevance/preview`,
        { method: 'POST', body: JSON.stringify({ target, ids }) },
      ),
    enabled: enabled && target.trim().length > 0 && ids.length > 0,
  });
}

/** Авто-класифікація релевантності через OpenRouter. НЕ пише в БД — повертає results для перегляду. */
export function useRunRelevance() {
  return useMutation({
    mutationFn: ({
      searchId,
      target,
      ids,
      model,
    }: {
      searchId: number;
      target: string;
      ids: number[];
      model?: string;
    }) =>
      api<RelevanceResponse>(`/api/searches/${searchId}/relevance/analyze`, {
        method: 'POST',
        body: JSON.stringify({ target, ids, model }),
      }),
  });
}

/** Парс вставленої відповіді релевантності + мерж у накопичене. НЕ пише в БД. */
export function useImportRelevance() {
  return useMutation({
    mutationFn: ({
      searchId,
      raw,
      accumulated,
      ids,
      target,
    }: {
      searchId: number;
      raw: string;
      accumulated: RelevanceItem[];
      ids?: number[];
      target?: string;
    }) =>
      api<RelevanceResponse>(`/api/searches/${searchId}/relevance/import`, {
        method: 'POST',
        body: JSON.stringify({ raw, accumulated, ids, target }),
      }),
  });
}

/** Запис результату класифікації у БД. Інвалідує кеш listings. */
export function useCommitRelevance() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      searchId,
      items,
      source,
    }: {
      searchId: number;
      items: RelevanceItem[];
      source: 'api' | 'import';
    }) =>
      api<{ committed: number }>(`/api/searches/${searchId}/relevance/commit`, {
        method: 'POST',
        body: JSON.stringify({ items, source }),
      }),
    onSuccess: (_data, { searchId }) =>
      qc.invalidateQueries({ queryKey: ['listings', searchId] }),
  });
}

/** Завантажує ZIP-пакет ручного режиму (prompt.txt + descriptions/chunk-NNN.json) через blob. */
export async function fetchRelevancePackageZip(
  searchId: number,
  target: string,
  ids: number[],
): Promise<void> {
  const blob = await apiBlob(`/api/searches/${searchId}/relevance/package.zip`, {
    method: 'POST',
    body: JSON.stringify({ target, ids }),
  });
  downloadBlob(blob, `relevance-search-${searchId}.zip`);
}
