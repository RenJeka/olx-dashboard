import {
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';

// Типи DTO (дублюємо мінімально, без build-зчеплень із server).
export interface Search {
  id: number;
  name: string;
  query: string;
  api_filters: string;
  visible_total_count: number | null;
  created_at: string;
}

export interface Listing {
  id: number;
  olx_id: number;
  search_id: number;
  title: string | null;
  url: string | null;
  price: number | null;
  currency: string;
  city: string | null;
  photo_url: string | null;
  description: string | null;
  seller_name: string | null;
  contact_name: string | null;
  olx_status: string | null;
  status: string;
  posted_at: string | null;
  first_seen_at: string;
  last_seen_at: string | null;
}

export interface ScanResult {
  found: number;
  new_count: number;
}

export interface NewSearchInput {
  name: string;
  query: string;
  priceFrom?: number;
  priceTo?: number;
}

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  // Content-Type ставимо лише коли є тіло — інакше Fastify відхиляє порожнє JSON-тіло.
  const headers = init?.body ? { 'Content-Type': 'application/json' } : undefined;
  const res = await fetch(path, { headers, ...init });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? `HTTP ${res.status}`);
  }
  return res.json() as Promise<T>;
}

export function useSearches() {
  return useQuery({
    queryKey: ['searches'],
    queryFn: () => api<Search[]>('/api/searches'),
  });
}

export function useCreateSearch() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: NewSearchInput) => {
      const ranges: Record<string, { from?: number; to?: number }> = {};
      if (input.priceFrom != null || input.priceTo != null) {
        ranges.price = { from: input.priceFrom, to: input.priceTo };
      }
      return api<Search>('/api/searches', {
        method: 'POST',
        body: JSON.stringify({
          name: input.name,
          query: input.query,
          api_filters: { ranges },
        }),
      });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['searches'] }),
  });
}

export function useScan() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (searchId: number) =>
      api<ScanResult>(`/api/searches/${searchId}/scan`, { method: 'POST' }),
    onSuccess: (_data, searchId) =>
      qc.invalidateQueries({ queryKey: ['listings', searchId] }),
  });
}

export function useListings(searchId: number | null) {
  return useQuery({
    queryKey: ['listings', searchId],
    queryFn: () => api<Listing[]>(`/api/searches/${searchId}/listings`),
    enabled: searchId != null,
  });
}
