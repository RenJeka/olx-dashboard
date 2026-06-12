import { HStack, Input, SegmentGroup, Stack } from '@chakra-ui/react';
import { Switch } from '../ui/switch';
import { LISTING_STATUSES, type Listing, type ListingStatus } from '../../types';
import { STATUS_LABELS } from '../../utils/status';

interface Props {
  listings: Listing[];
  statusFilter: ListingStatus | 'all';
  onStatusFilterChange: (value: ListingStatus | 'all') => void;
  showFilteredOut: boolean;
  onShowFilteredOutChange: (value: boolean) => void;
  searchText: string;
  onSearchTextChange: (value: string) => void;
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
          <SegmentGroup.Indicator />
          <SegmentGroup.Items items={items} />
        </SegmentGroup.Root>
        <Switch
          checked={showFilteredOut}
          onCheckedChange={(d) => onShowFilteredOutChange(d.checked)}
        >
          Показати відфільтровані
        </Switch>
      </HStack>
      <Input
        size="sm"
        maxW="360px"
        placeholder="Пошук у назві й описі..."
        value={searchText}
        onChange={(e) => onSearchTextChange(e.target.value)}
      />
    </Stack>
  );
}
