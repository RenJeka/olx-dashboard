import { useMemo } from 'react';
import { useListingsUiStore } from '../../stores/listingsUiStore';
import { useListings } from '../../api';
import { useListingsMap } from '../useListingsMap';
import { isListingVisible, passesNoiseFilters } from '../../utils/listingVisibility';
import { buildScopeLabel } from '../../utils/analysis';
import type { AnalysisScope } from '../../stores/analysisWizardStore';

/**
 * Хук для обчислення множин ідентифікаторів (scope) для AI-аналізу.
 * Визначає, які саме оголошення підуть в аналіз (вибрані, всі видимі на вкладці тощо),
 * зважаючи на налаштування локальних фільтрів та приховування "шуму".
 */
export function useAnalysisScope(searchId: number, selectedIds: number[], open: boolean, scope: AnalysisScope) {
  const { data: listings } = useListings(open ? searchId : null);
  const listingById = useListingsMap(listings);

  const statusFilter = useListingsUiStore((s) => s.statusFilter);
  const showFilteredOut = useListingsUiStore((s) => s.showFilteredOut);
  const showIrrelevant = useListingsUiStore((s) => s.showIrrelevant);

  // «Весь пошук» = всі рядки, видимі за «шумовими» перемикачами
  const allIds = useMemo(
    () =>
      (listings ?? [])
        .filter((l) => passesNoiseFilters(l, showFilteredOut, showIrrelevant))
        .map((l) => l.id),
    [listings, showFilteredOut, showIrrelevant],
  );

  // «Таб» = рядки поточної вкладки
  const tabIds = useMemo(
    () =>
      statusFilter === 'all'
        ? allIds
        : (listings ?? [])
            .filter((l) => isListingVisible(l, statusFilter, showFilteredOut, showIrrelevant))
            .map((l) => l.id),
    [listings, statusFilter, showFilteredOut, showIrrelevant, allIds],
  );

  const effectiveIds = useMemo(() => {
    if (scope === 'selected') return selectedIds;
    if (scope === 'tab') return tabIds;
    return allIds;
  }, [scope, selectedIds, allIds, tabIds]);

  const tabCount = statusFilter !== 'all' ? tabIds.length : 0;
  const scopeLabel = buildScopeLabel(scope, statusFilter);

  return {
    listings,
    listingById,
    allIds,
    tabIds,
    effectiveIds,
    tabCount,
    scopeLabel,
    statusFilter,
    selectedIds,
  };
}
