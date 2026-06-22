import { useState } from 'react';
import { Badge, Box, HStack, IconButton, Stack, Text } from '@chakra-ui/react';
import { LuChevronDown, LuChevronUp } from 'react-icons/lu';
import { SearchRowMenu } from './SearchRowMenu';
import { SearchDeleteDialog } from './SearchDeleteDialog';
import { SearchFiltersDrawer } from './SearchFiltersDrawer';
import { SearchVariantsDialog } from './SearchVariantsDialog';
import { SearchEditDialog } from './SearchEditDialog';
import { Tooltip } from '../ui/tooltip';
import { useUpdateSearchSynonyms } from '../../api';
import { useSearchRowActions } from '../../hooks/useSearchRowActions';
import { formatPriceRange, parsePriceRange } from '../../utils/format';
import { hasActiveLocalFilters } from '../../utils/localFilters';
import { parseSearchSynonyms } from '../../utils/searchSynonyms';
import { sortAlpha } from '../../utils/sort';
import type { Search } from '../../types';

interface Props {
  search: Search;
  selected: boolean;
  isFirst: boolean;
  isLast: boolean;
  onSelect: () => void;
  onDeleted: () => void;
}

/** Рядок пошуку в бічній панелі: назва/запит/ціна, бейдж синонімів, реордер, 3-dot меню дій. */
export function SearchRow({ search, selected, isFirst, isLast, onSelect, onDeleted }: Props) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [variantsOpen, setVariantsOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const updateSynonyms = useUpdateSearchSynonyms();
  const { isArchived, deleteSearch, reorderSearch, handleArchiveToggle, handleDelete, handleMove } =
    useSearchRowActions(search);

  const synonyms = parseSearchSynonyms(search.query_synonyms);
  const priceRange = parsePriceRange(search.api_filters);

  function confirmDelete() {
    handleDelete(() => {
      setConfirmOpen(false);
      onDeleted();
    });
  }

  return (
    <Box>
      <HStack
        colorPalette="accent"
        justify="space-between"
        gap={1}
        px={2}
        py={1}
        rounded="md"
        cursor="pointer"
        bg={selected ? 'colorPalette.subtle' : undefined}
        _hover={{ bg: selected ? 'colorPalette.subtle' : 'bg.muted' }}
        onClick={onSelect}
      >
        <Box overflow="hidden" flex="1" minW={0}>
          <HStack gap={1} overflow="hidden">
            <Text textStyle="sm" fontWeight="medium" overflow="hidden" textOverflow="ellipsis" whiteSpace="nowrap" flex="1">
              {search.name}
            </Text>
            {synonyms.length > 0 && (
              <Tooltip
                content={
                  <Stack gap={0.5} maxW="220px">
                    <Text fontWeight="semibold" fontSize="xs">
                      Додаткові варіанти пошуку:
                    </Text>
                    {sortAlpha(synonyms).map((s) => (
                      <Text key={s} fontSize="xs">
                        • {s}
                      </Text>
                    ))}
                  </Stack>
                }
              >
                <Badge
                  size="xs"
                  colorPalette="accent"
                  variant="solid"
                  rounded="full"
                  flexShrink={0}
                  cursor="default"
                >
                  +{synonyms.length}
                </Badge>
              </Tooltip>
            )}
            {hasActiveLocalFilters(search.local_filters) && (
              <Tooltip content="Застосований фільтр">
                <Box w="2" h="2" bg="orange.500" rounded="full" flexShrink={0} cursor="default" />
              </Tooltip>
            )}
          </HStack>
          <Text textStyle="xs" color="fg.muted" overflow="hidden" textOverflow="ellipsis" whiteSpace="nowrap">
            {search.query}
          </Text>
          {priceRange && (
            <Text
              textStyle="xs"
              color="orange.500"
              fontWeight="medium"
              overflow="hidden"
              textOverflow="ellipsis"
              whiteSpace="nowrap"
            >
              {formatPriceRange(priceRange.from, priceRange.to)}
            </Text>
          )}
        </Box>
        {!isArchived && (
          <>
            <Tooltip content="Пересунути вгору">
              <IconButton
                aria-label="Пересунути вгору"
                size="2xs"
                variant="ghost"
                disabled={isFirst || reorderSearch.isPending}
                onClick={(e) => {
                  e.stopPropagation();
                  handleMove('up');
                }}
              >
                <LuChevronUp />
              </IconButton>
            </Tooltip>
            <Tooltip content="Пересунути вниз">
              <IconButton
                aria-label="Пересунути вниз"
                size="2xs"
                variant="ghost"
                disabled={isLast || reorderSearch.isPending}
                onClick={(e) => {
                  e.stopPropagation();
                  handleMove('down');
                }}
              >
                <LuChevronDown />
              </IconButton>
            </Tooltip>
          </>
        )}
        <SearchRowMenu
          isArchived={isArchived}
          synonymsCount={synonyms.length}
          onEdit={() => setEditOpen(true)}
          onFilters={() => setFiltersOpen(true)}
          onVariants={() => setVariantsOpen(true)}
          onArchiveToggle={handleArchiveToggle}
          onDeleteRequest={() => setConfirmOpen(true)}
        />
      </HStack>
      <SearchEditDialog search={search} open={editOpen} onOpenChange={setEditOpen} />
      <SearchFiltersDrawer search={search} open={filtersOpen} onOpenChange={setFiltersOpen} />
      <SearchVariantsDialog
        open={variantsOpen}
        onOpenChange={setVariantsOpen}
        query={search.query}
        value={synonyms}
        onChange={(next) => updateSynonyms.mutate({ searchId: search.id, querySynonyms: next })}
      />
      <SearchDeleteDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        searchName={search.name}
        isPending={deleteSearch.isPending}
        onConfirm={confirmDelete}
      />
    </Box>
  );
}
