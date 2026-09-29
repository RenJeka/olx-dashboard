import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from './base';
import type { AppLogsResponse } from '../types';

export interface LogsFilters {
  level?: 'warn' | 'error';
  scope?: string;
}

/**
 * Технічний журнал застосунку (docs/plans/logging-system.md). `enabled` — лише при
 * відкритому діалозі; авто-оновлення кожні 5с, поки відкрито (нові помилки видно одразу).
 */
export function useLogs(filters: LogsFilters, enabled: boolean) {
  const params = new URLSearchParams();
  if (filters.level) params.set('level', filters.level);
  if (filters.scope) params.set('scope', filters.scope);
  const qs = params.toString();

  return useQuery({
    queryKey: ['app-logs', filters.level ?? 'all', filters.scope ?? 'all'],
    queryFn: () => api<AppLogsResponse>(`/api/logs${qs ? `?${qs}` : ''}`),
    enabled,
    refetchInterval: enabled ? 5000 : false,
  });
}

/** Повне очищення журналу (кнопка «Очистити» в діалозі). */
export function useClearLogs() {
  const qc = useQueryClient();
  return useMutation({
    mutationKey: ['app-logs-clear'],
    mutationFn: () => api<{ deleted: number }>('/api/logs', { method: 'DELETE' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['app-logs'] });
    },
  });
}
