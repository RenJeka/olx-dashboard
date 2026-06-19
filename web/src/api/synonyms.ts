import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from './base';
import type { Search } from '../types';

/** Готовий промпт генерації синонімів (ручний режим) — stateless, не залежить від searchId. */
export function fetchSynonymsPrompt(query: string): Promise<{ prompt: string }> {
  return api<{ prompt: string }>('/api/search-synonyms/prompt', {
    method: 'POST',
    body: JSON.stringify({ query }),
  });
}

/** Авто-генерація синонімів (OpenRouter). */
export function useGenerateSynonyms() {
  return useMutation({
    mutationFn: ({ query, model }: { query: string; model?: string }) =>
      api<{ synonyms: string[] }>('/api/search-synonyms/generate', {
        method: 'POST',
        body: JSON.stringify({ query, model }),
      }),
  });
}

/** Парс вставленої відповіді з синонімами. */
export function useImportSynonyms() {
  return useMutation({
    mutationFn: ({ raw }: { raw: string }) =>
      api<{ synonyms: string[] }>('/api/search-synonyms/import', {
        method: 'POST',
        body: JSON.stringify({ raw }),
      }),
  });
}

/** Зберегти синоніми query для існуючого пошуку (PATCH /api/searches/:id). */
export function useUpdateSearchSynonyms() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ searchId, querySynonyms }: { searchId: number; querySynonyms: string[] }) =>
      api<Search>(`/api/searches/${searchId}`, {
        method: 'PATCH',
        body: JSON.stringify({ query_synonyms: querySynonyms }),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['searches'] }),
  });
}
