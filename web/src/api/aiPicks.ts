import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from './base';
import { downloadBlob } from '../utils/download';
import type { PickItem, PickResult } from '../types';

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
