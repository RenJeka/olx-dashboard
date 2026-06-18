import { Box, HStack, SegmentGroup, Stack, Text, Icon } from '@chakra-ui/react';
import { LuInfo } from 'react-icons/lu';
import { PiFolderSimpleStarThin } from 'react-icons/pi';
import { Switch } from '../../ui/switch';
import { Tooltip } from '../../ui/tooltip';
import { LISTING_STATUSES, type Listing } from '../../../types';
import { STATUS_LABELS } from '../../../utils/status';
import { isAiPickCandidate, passesNoiseFilters } from '../../../utils/listingVisibility';
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
  const visible = listings.filter((l) => passesNoiseFilters(l, showFilteredOut, showIrrelevant));
  const irrelevantCount = listings.filter((l) => l.ai_relevant === 0).length;

  const aiPicksCount = listings.filter(isAiPickCandidate).length;

  const aiPicksTooltipContent = (
    <Stack gap={1.5} maxW="320px" py={1} px={1}>
      <Text fontWeight="semibold" fontSize="xs" color="fg.default">«Найкращі кандидати» — це шорт-лист оголошень:</Text>
      <Box as="ul" pl={4} fontSize="xs" color="fg.muted" css={{ '& li': { mb: 0.5 } }}>
        <li><strong>Без мінусів</strong> — поле cons порожнє</li>
        <li><strong>Активні</strong> — не disabled/rejected</li>
        <li><strong>В зоні фільтрів</strong> — не відфільтровані</li>
        <li><strong>Релевантні</strong> — пройшли AI Фільтр</li>
      </Box>
    </Stack>
  );

  const items = [
    { value: 'all', label: `Всі (${visible.length})` },
    ...LISTING_STATUSES.map((status) => ({
      value: status,
      label: `${STATUS_LABELS[status]} (${visible.filter((l) => l.status === status).length})`,
    })),
    {
      value: 'ai_picks',
      label: (
        <Tooltip content={aiPicksTooltipContent} positioning={{ placement: 'top' }} showArrow openDelay={200}>
          <HStack as="span" gap={1.5} display="inline-flex" position="relative" pr={3}>
            <Icon asChild fontSize="md"><PiFolderSimpleStarThin /></Icon>
            <Box as="span">Найкращі кандидати ({aiPicksCount})</Box>
            <Box as="span" position="absolute" top="-2px" right="-4px" color="fg.subtle" fontSize="10px">
              <LuInfo />
            </Box>
          </HStack>
        </Tooltip>
      ),
    },
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
        <Tooltip
          content="На цій вкладці перемикач ігнорується"
          disabled={statusFilter !== 'ai_picks'}
          showArrow
          positioning={{ placement: 'top' }}
        >
          <Box display="inline-block">
            <Switch
              checked={!showFilteredOut}
              onCheckedChange={(d) => setShowFilteredOut(!d.checked)}
              colorPalette={showFilteredOut ? undefined : 'orange'}
              disabled={statusFilter === 'ai_picks'}
            >
              <HStack as="span" gap={1.5}>
                <Box as="span">
                  Показані{' '}
                  <Box
                    as="span"
                    fontWeight="bold"
                    color={showFilteredOut ? undefined : 'orange.500'}
                  >
                    {showFilteredOut ? 'ВСІ' : 'ВІДФІЛЬТРОВАНІ'}
                  </Box>{' '}
                  товари
                </Box>
                {statusFilter === 'ai_picks' && (
                  <Box as="span" color="fg.subtle">
                    <LuInfo />
                  </Box>
                )}
              </HStack>
            </Switch>
          </Box>
        </Tooltip>
        {irrelevantCount > 0 && (
          <Tooltip
            content="На цій вкладці перемикач ігнорується"
            disabled={statusFilter !== 'ai_picks'}
            showArrow
            positioning={{ placement: 'top' }}
          >
            <Box display="inline-block">
              <Switch
                checked={showIrrelevant}
                onCheckedChange={(d) => setShowIrrelevant(d.checked)}
                colorPalette="cyan"
                disabled={statusFilter === 'ai_picks'}
              >
                <HStack as="span" gap={1.5}>
                  <Box as="span">Показати нерелевантні ({irrelevantCount})</Box>
                  {statusFilter === 'ai_picks' && (
                    <Box as="span" color="fg.subtle">
                      <LuInfo />
                    </Box>
                  )}
                </HStack>
              </Switch>
            </Box>
          </Tooltip>
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
