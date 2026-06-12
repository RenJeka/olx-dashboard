import { Box, HStack, Input, SegmentGroup, Stack } from '@chakra-ui/react';
import { useEffect, useState } from 'react';
import { LuX } from 'react-icons/lu';
import { Switch } from '../ui/switch';
import { LISTING_STATUSES, type Listing, type ListingStatus } from '../../types';
import { STATUS_LABELS } from '../../utils/status';
import { BulkActionBar } from './BulkActionBar';

interface Props {
  listings: Listing[];
  statusFilter: ListingStatus | 'all';
  onStatusFilterChange: (value: ListingStatus | 'all') => void;
  showFilteredOut: boolean;
  onShowFilteredOutChange: (value: boolean) => void;
  searchText: string;
  onSearchTextChange: (value: string) => void;
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
  searchId,
  selectedIds,
  onClearSelection,
}: Props) {
  const [inputValue, setInputValue] = useState(searchText);

  useEffect(() => {
    const timer = setTimeout(() => onSearchTextChange(inputValue), 500);
    return () => clearTimeout(timer);
  }, [inputValue]); // eslint-disable-line react-hooks/exhaustive-deps

  // Синхронізація при зовнішньому скиданні (наприклад, зміна пошуку)
  useEffect(() => {
    if (searchText === '') setInputValue('');
  }, [searchText]);

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
        <Box position="relative" w="full" maxW="360px">
          <Input
            size="sm"
            pr={inputValue ? '28px' : undefined}
            placeholder="Пошук у назві й описі..."
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
          />
          {inputValue && (
            <Box
              as="button"
              position="absolute"
              right="6px"
              top="50%"
              transform="translateY(-50%)"
              display="flex"
              alignItems="center"
              color="fg.muted"
              _hover={{ color: 'fg' }}
              onClick={() => setInputValue('')}
              aria-label="Очистити пошук"
              px={2}
            >
              <LuX size={20} cursor="pointer" />
            </Box>
          )}
        </Box>
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
