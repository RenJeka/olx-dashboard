import { useMemo } from 'react';
import type { Listing } from '../types';

/** Будує мемоїзовану Map<id, Listing> з масиву listings. */
export function useListingsMap(listings: Listing[] | undefined): Map<number, Listing> {
  return useMemo(() => {
    const m = new Map<number, Listing>();
    for (const l of listings ?? []) m.set(l.id, l);
    return m;
  }, [listings]);
}
