import { useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, AUTH_UNAUTHORIZED_EVENT } from '../api/base';

export interface Session {
  email: string;
}

const ME_KEY = ['auth', 'me'] as const;

/**
 * Поточна сесія. 401 → query.isError (не залогінений). Слухає глобальну подію 401
 * (будь-який API-виклик з простроченою сесією) і інвалідовує себе → застосунок на гейт.
 */
export function useSession() {
  const qc = useQueryClient();

  useEffect(() => {
    const onUnauthorized = () => {
      qc.setQueryData(ME_KEY, null);
      qc.invalidateQueries({ queryKey: ME_KEY });
    };
    window.addEventListener(AUTH_UNAUTHORIZED_EVENT, onUnauthorized);
    return () => window.removeEventListener(AUTH_UNAUTHORIZED_EVENT, onUnauthorized);
  }, [qc]);

  return useQuery<Session>({
    queryKey: ME_KEY,
    queryFn: () => api<Session>('/api/auth/me'),
    retry: false,
    staleTime: Infinity,
    gcTime: Infinity,
  });
}

/** Логін через Google ID-token → сесійна кукі ставиться сервером. */
export function useLogin() {
  const qc = useQueryClient();
  return useMutation<Session, Error, string>({
    mutationFn: (credential) =>
      api<Session>('/api/auth/google', {
        method: 'POST',
        body: JSON.stringify({ credential }),
      }),
    onSuccess: (session) => {
      qc.setQueryData(ME_KEY, session);
    },
  });
}

/** Вихід → кукі чиститься, повертаємось на гейт. */
export function useLogout() {
  const qc = useQueryClient();
  return useMutation<{ ok: boolean }, Error, void>({
    mutationFn: () => api<{ ok: boolean }>('/api/auth/logout', { method: 'POST' }),
    onSuccess: () => {
      qc.setQueryData(ME_KEY, null);
      qc.invalidateQueries({ queryKey: ME_KEY });
    },
  });
}
