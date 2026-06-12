import { HStack, SegmentGroup, Stack } from '@chakra-ui/react';
import { Switch } from '../../ui/switch';
import { LISTING_STATUSES, type Listing, type ListingStatus } from '../../../types';
import { STATUS_LABELS } from '../../../utils/status';
import { BulkActionBar } from './BulkActionBar';
import { SearchInput, type SearchScope } from './SearchInput';

interface Props {
  listings: Listing[];
  statusFilter: ListingStatus | 'all';
  onStatusFilterChange: (value: ListingStatus | 'all') => void;
  showFilteredOut: boolean;
  onShowFilteredOutChange: (value: boolean) => void;
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
  statusFilter,
  onStatusFilterChange,
  showFilteredOut,
  onShowFilteredOutChange,
  searchText,
  onSearchTextChange,
  searchScope,
  onSearchScopeChange,
  searchId,
  selectedIds,
  onClearSelection,
}: Props) {
  const visible = listings.filter((l) => showFilteredOut || l.filtered_out === 0);

  const items = [
    { value: 'all', label: `Всі (${visible.length})` },
    ...LISTING_STATUSES.map((status) => ({
      value: status,
      label: `${STATUS_LABELS[status]} (${visible.filter((l) => l.status === status).length})`,
    })),
  ];

  return (
    <Stack gap={2} px={4} pt={3} pb={2}>
      <HStack gap={4} wrap="wrap">
        <SegmentGroup.Root
          size="sm"
          value={statusFilter}
          onValueChange={(d) => onStatusFilterChange((d.value as ListingStatus | 'all') ?? 'all')}
        >
          <SegmentGroup.Indicator cursor="pointer" />
          <SegmentGroup.Items items={items} cursor="pointer" />
        </SegmentGroup.Root>
        <Switch
          checked={showFilteredOut}
          onCheckedChange={(d) => onShowFilteredOutChange(d.checked)}
        >
          Показати відфільтровані
        </Switch>
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
