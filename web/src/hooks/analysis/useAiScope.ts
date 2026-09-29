import { useMemo } from 'react';
import { useListingsUiStore } from '../../stores/listingsUiStore';
import { useListings } from '../../api';
import { useListingsMap } from '../useListingsMap';
import { getScopeCounts, getScopeIds, type AiScope, type ScopeContext } from '../../utils/aiScope';

/**
 * Спільний хук обсягу для всіх AI-флоу (релевантність, майстер, AI Picks).
 * Бере `listings` пошуку + читає поточну вкладку та «шумові» перемикачі з
 * `listingsUiStore`, повертає лічильники всіх обсягів і ID активного обсягу.
 */
export function useAiScope(searchId: number, selectedIds: number[], open: boolean, scope: AiScope) {
  const { data: listings } = useListings(open ? searchId : null);
  const listingById = useListingsMap(listings);

  const statusFilter = useListingsUiStore((s) => s.statusFilter);
  const showFilteredOut = useListingsUiStore((s) => s.showFilteredOut);
  const showIrrelevant = useListingsUiStore((s) => s.showIrrelevant);

  const ctx: ScopeContext = useMemo(
    () => ({ listings, selectedIds, statusFilter, showFilteredOut, showIrrelevant }),
    [listings, selectedIds, statusFilter, showFilteredOut, showIrrelevant],
  );

  const counts = useMemo(() => getScopeCounts(ctx), [ctx]);
  const effectiveIds = useMemo(() => getScopeIds(scope, ctx), [scope, ctx]);

  return { listings, listingById, counts, effectiveIds, statusFilter };
}
