import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from './base';
import type { ScanResult, ScanStatus, VerifyResult } from '../types';

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

/** Поллінг прогресу глибокого скану (раз на ~1.5с, поки enabled). */
export function useScanStatus(searchId: number | null, enabled: boolean) {
  return useQuery({
    queryKey: ['scan-status', searchId],
    queryFn: () => api<ScanStatus>(`/api/searches/${searchId}/scan-status`),
    enabled: enabled && searchId != null,
    refetchInterval: 1500,
  });
}
