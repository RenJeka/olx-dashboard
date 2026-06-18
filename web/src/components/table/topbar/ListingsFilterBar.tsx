import { Box, HStack, SegmentGroup, Stack } from '@chakra-ui/react';
import { Switch } from '../../ui/switch';
import { LISTING_STATUSES, type Listing } from '../../../types';
import { STATUS_LABELS, isMutedStatus } from '../../../utils/status';
import { BulkActionBar } from './BulkActionBar';
import { SearchInput, type SearchScope } from './SearchInput';
import { useListingsUiStore } from '../../../stores/listingsUiStore';

interface Props {
  listings: Listing[];
  searchText: string;
  onSearchTextChange: (value: string) => void;
  searchScope: SearchScope;
  onSearchScopeChange: (scope: SearchScope) => void;
  // bulk action
  searchId?: number;
  selectedIds?: number[];
  onClearSelection?: () => void;
}

/** Панель над таблицею: фільтр за статусом (з лічильниками), toggle filtered_out, пошук. */
export function ListingsFilterBar({
  listings,
  searchText,
  onSearchTextChange,
  searchScope,
  onSearchScopeChange,
  searchId,
  selectedIds,
  onClearSelection,
}: Props) {
  const statusFilter = useListingsUiStore((s) => s.statusFilter);
  const setStatusFilter = useListingsUiStore((s) => s.setStatusFilter);
  const showFilteredOut = useListingsUiStore((s) => s.showFilteredOut);
  const setShowFilteredOut = useListingsUiStore((s) => s.setShowFilteredOut);
  const showIrrelevant = useListingsUiStore((s) => s.showIrrelevant);
  const setShowIrrelevant = useListingsUiStore((s) => s.setShowIrrelevant);
  const visible = listings.filter(
    (l) => (showFilteredOut || l.filtered_out === 0) && (showIrrelevant || l.ai_relevant !== 0),
  );
  const irrelevantCount = listings.filter((l) => l.ai_relevant === 0).length;

  const aiPicksCount = listings.filter(
    (l) => !l.cons && !isMutedStatus(l.status) && l.filtered_out === 0 && l.ai_relevant !== 0,
  ).length;

  const items = [
    { value: 'all', label: `Всі (${visible.length})` },
    ...LISTING_STATUSES.map((status) => ({
      value: status,
      label: `${STATUS_LABELS[status]} (${visible.filter((l) => l.status === status).length})`,
    })),
    { value: 'ai_picks', label: `AI Вибір (${aiPicksCount})` },
  ];

  return (
    <Stack gap={2} px={4} pt={3} pb={2}>
      <HStack gap={4} wrap="wrap">
        <Box overflowX="auto" maxW="100%">
          <SegmentGroup.Root
            size="sm"
            value={statusFilter}
            onValueChange={(d) => setStatusFilter((d.value as typeof statusFilter) ?? 'all')}
          >
            <SegmentGroup.Indicator cursor="pointer" />
            <SegmentGroup.Items items={items} cursor="pointer" />
          </SegmentGroup.Root>
        </Box>
        <Switch
          checked={!showFilteredOut}
          onCheckedChange={(d) => setShowFilteredOut(!d.checked)}
          colorPalette={showFilteredOut ? undefined : 'orange'}
        >
          Показані{' '}
          <Box
            as="span"
            fontWeight="bold"
            color={showFilteredOut ? undefined : 'orange.500'}
          >
            {showFilteredOut ? 'ВСІ' : 'ВІДФІЛЬТРОВАНІ'}
          </Box>{' '}
          товари
        </Switch>
        {irrelevantCount > 0 && (
          <Switch
            checked={showIrrelevant}
            onCheckedChange={(d) => setShowIrrelevant(d.checked)}
            colorPalette="cyan"
          >
            Показати нерелевантні ({irrelevantCount})
          </Switch>
        )}
      </HStack>

      {/* Search + BulkActionBar у тому ж рядку */}
      <HStack gap={3} wrap="wrap">
        <SearchInput
          value={searchText}
          onChange={onSearchTextChange}
          scope={searchScope}
          onScopeChange={onSearchScopeChange}
        />
        {selectedIds && selectedIds.length > 0 && searchId != null && onClearSelection && (
          <BulkActionBar
            searchId={searchId}
            selectedIds={selectedIds}
            onClear={onClearSelection}
          />
        )}
      </HStack>
    </Stack>
  );
}
