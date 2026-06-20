import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from './base';
import type { ScanResult, ScanStatus, VerifyResult, ScanPlan, LastAnalysis } from '../types';

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

/**
 * Аналітична (probe) фаза двофазного глибокого скану (docs/plans/two-phase-deep-scan.md):
 * лише зондування + бісекція, повертає звіт ScanPlan для ScanPlanReportDialog.
 */
export function useAnalyzeScan() {
  return useMutation({
    mutationKey: ['scan-analyze'],
    mutationFn: ({ searchId, deep = true }: { searchId: number; deep?: boolean }) =>
      api<ScanPlan>(`/api/searches/${searchId}/scan/analyze${deep ? '?deep=true' : ''}`, {
        method: 'POST',
      }),
  });
}

/** Запуск повного глибокого скану за раніше зібраним планом (без повторного зондування). */
export function useRunScanPlan() {
  const qc = useQueryClient();
  return useMutation({
    mutationKey: ['scan-run-plan'],
    mutationFn: ({ searchId, planToken }: { searchId: number; planToken: string }) =>
      api<ScanResult>(`/api/searches/${searchId}/scan/run-plan`, {
        method: 'POST',
        body: JSON.stringify({ planToken }),
      }),
    onSuccess: (_data, { searchId }) => {
      qc.invalidateQueries({ queryKey: ['listings', searchId] });
      qc.invalidateQueries({ queryKey: ['search-stats', searchId] });
    },
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

/** Зупинка активного скану (docs/plans/deep-scan-stop-and-history.md): зібране зберігається у БД. */
export function useStopScan() {
  return useMutation({
    mutationKey: ['scan-stop'],
    mutationFn: (searchId: number) =>
      api<{ stopped: boolean }>(`/api/searches/${searchId}/scan/stop`, { method: 'POST' }),
  });
}

/**
 * Останній збережений аналіз пошуку (для перегляду без повторного зондування).
 * 404 (аналізів ще не було) ловиться у queryFn → null. `enabled` лише при відкритому діалозі.
 */
export function useLastAnalysis(searchId: number | null, enabled: boolean) {
  return useQuery({
    queryKey: ['last-analysis', searchId],
    queryFn: async (): Promise<LastAnalysis | null> => {
      try {
        return await api<LastAnalysis>(`/api/searches/${searchId}/last-analysis`);
      } catch {
        return null;
      }
    },
    enabled: enabled && searchId != null,
  });
}
