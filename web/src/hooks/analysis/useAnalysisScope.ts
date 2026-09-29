import { useMemo } from 'react';
import { useListingsUiStore } from '../../stores/listingsUiStore';
import { useListings } from '../../api';
import { useListingsMap } from '../useListingsMap';
import { buildScopeLabel } from '../../utils/analysis';
import { getScopeCounts, getScopeIds, type ScopeContext } from '../../utils/aiScope';
import type { AnalysisScope } from '../../stores/analysisWizardStore';

/**
 * Хук обчислення обсягу (scope) для майстра AI-аналізу. Будує спільний `ScopeContext`
 * і дістає ID/лічильники через `utils/aiScope`. «Весь пошук» = геть усі рядки,
 * «таб» = рівно те, що показано в таблиці активної вкладки.
 */
export function useAnalysisScope(searchId: number, selectedIds: number[], open: boolean, scope: AnalysisScope) {
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
  const allIds = useMemo(() => getScopeIds('all', ctx), [ctx]);
  const tabIds = useMemo(() => getScopeIds('tab', ctx), [ctx]);
  const effectiveIds = useMemo(() => getScopeIds(scope, ctx), [scope, ctx]);

  const scopeLabel = buildScopeLabel(scope, statusFilter);

  return {
    listings,
    listingById,
    allIds,
    tabIds,
    effectiveIds,
    counts,
    tabCount: counts.tab,
    scopeLabel,
    statusFilter,
    selectedIds,
  };
}
