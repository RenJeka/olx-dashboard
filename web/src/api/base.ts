export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  // Content-Type ставимо лише коли є тіло — інакше Fastify відхиляє порожнє JSON-тіло.
  const headers = init?.body ? { 'Content-Type': 'application/json' } : undefined;
  const res = await fetch(path, { headers, ...init });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? `HTTP ${res.status}`);
  }
  return res.json() as Promise<T>;
}
