import { Accordion, HStack, IconButton } from '@chakra-ui/react';
import { LuArchive, LuListChecks, LuPlus } from 'react-icons/lu';
import { SearchGroupAccordionItem } from './SearchGroupAccordionItem';
import { Tooltip } from '../ui/tooltip';
import type { Search } from '../../types';

interface Props {
  isLoading: boolean;
  activeSearches: Search[];
  archivedSearches: Search[];
  selectedId: number | null;
  onSelect: (id: number) => void;
  onDeleted: (id: number) => void;
  onNewSearch: () => void;
}

/** Вміст бічної панелі: кнопка «Новий пошук» + акордеон «Пошуки» / «Архів» (опц.). */
export function SearchesPanel({
  isLoading,
  activeSearches,
  archivedSearches,
  selectedId,
  onSelect,
  onDeleted,
  onNewSearch,
}: Props) {
  return (
    <>
      <HStack justify="flex-end" px={4} py={3}>
        <Tooltip content="Новий пошук">
          <IconButton
            aria-label="Новий пошук"
            rounded="full"
            size="lg"
            colorPalette="success"
            variant="solid"
            shadow="md"
            onClick={onNewSearch}
          >
            <LuPlus />
          </IconButton>
        </Tooltip>
      </HStack>
      <Accordion.Root multiple defaultValue={['searches']} variant="plain">
        <SearchGroupAccordionItem
          value="searches"
          icon={<LuListChecks />}
          label="Пошуки"
          badgeColorPalette="accent"
          items={activeSearches}
          selectedId={selectedId}
          onSelect={onSelect}
          onDeleted={onDeleted}
          isLoading={isLoading}
          emptyMessage="Поки що порожньо — додай перший пошук нижче."
        />

        {archivedSearches.length > 0 && (
          <SearchGroupAccordionItem
            value="archive"
            icon={<LuArchive />}
            label="Архів"
            badgeColorPalette="gray"
            items={archivedSearches}
            selectedId={selectedId}
            onSelect={onSelect}
            onDeleted={onDeleted}
          />
        )}
      </Accordion.Root>
    </>
  );
}
