import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api, apiBlob } from './base';
import { downloadBlob } from '../utils/download';
import type { PickItem, PickResult } from '../types';

/**
 * Готовий промпт для ручного AI-ранжування. POST (а не GET), щоб нести список `ids`
 * обраного обсягу (порожній/відсутній → серверний дефолтний пул кандидатів).
 */
export function fetchAiPicksPrompt(searchId: number, ids?: number[]): Promise<{ prompt: string }> {
  return api<{ prompt: string }>(`/api/searches/${searchId}/ai-picks/prompt`, {
    method: 'POST',
    body: JSON.stringify({ ids }),
  });
}

/** ZIP-пакет ручного режиму для великих пулів (prompt.txt + candidates/chunk-NNN.json) через blob. */
export async function fetchAiPicksPackageZip(searchId: number, ids?: number[]): Promise<void> {
  const blob = await apiBlob(`/api/searches/${searchId}/ai-picks/package.zip`, {
    method: 'POST',
    body: JSON.stringify({ ids }),
  });
  downloadBlob(blob, `ai-picks-search-${searchId}.zip`);
}

/** Авто-ранжування через OpenRouter. НЕ пише в БД — повертає picks для перегляду. */
export function useRunAiPicks() {
  return useMutation({
    mutationFn: ({ searchId, model, ids }: { searchId: number; model?: string; ids?: number[] }) =>
      api<PickResult>(`/api/searches/${searchId}/ai-picks/rank`, {
        method: 'POST',
        body: JSON.stringify({ model, ids }),
      }),
  });
}

/** Парс ручної відповіді. НЕ пише в БД — повертає picks для перегляду. */
export function useImportAiPicks() {
  return useMutation({
    mutationFn: ({ searchId, raw, ids }: { searchId: number; raw: string; ids?: number[] }) =>
      api<PickResult>(`/api/searches/${searchId}/ai-picks/import`, {
        method: 'POST',
        body: JSON.stringify({ raw, ids }),
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
