// Базовий префікс API. Локально порожній — Vite-проксі веде /api на :3001 (same-origin,
// кукі Lax). У проді (фронт і API на різних доменах Render) — повний URL API через VITE_API_BASE.
const API_BASE = import.meta.env.VITE_API_BASE ?? '';

/** Подія примусового ре-логіну: будь-який 401 від API повертає застосунок на гейт. */
export const AUTH_UNAUTHORIZED_EVENT = 'auth:unauthorized';

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  // Content-Type ставимо лише коли є тіло — інакше Fastify відхиляє порожнє JSON-тіло.
  const headers = init?.body ? { 'Content-Type': 'application/json' } : undefined;
  // credentials: 'include' — браузер шле сесійну кукі (зокрема cross-site у проді).
  const res = await fetch(`${API_BASE}${path}`, { headers, credentials: 'include', ...init });
  if (!res.ok) {
    // Сесія відпала/відсутня — сигналимо гейту (крім самих auth-ендпойнтів, які 401 обробляють самі).
    if (res.status === 401 && !path.startsWith('/api/auth/')) {
      window.dispatchEvent(new Event(AUTH_UNAUTHORIZED_EVENT));
    }
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? `HTTP ${res.status}`);
  }
  return res.json() as Promise<T>;
}
