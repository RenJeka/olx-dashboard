import { Accordion } from '@chakra-ui/react';
import { LuArchive, LuListChecks } from 'react-icons/lu';
import { SearchGroupAccordionItem } from './SearchGroupAccordionItem';
import { NewSearchForm } from './NewSearchForm';
import type { NewSearchFormState } from '../../hooks/useNewSearchForm';
import type { Search } from '../../types';

interface Props {
  isLoading: boolean;
  activeSearches: Search[];
  archivedSearches: Search[];
  selectedId: number | null;
  onSelect: (id: number) => void;
  onDeleted: (id: number) => void;
  newSearchForm: NewSearchFormState;
}

/** Вміст бічної панелі: акордеон «Пошуки» / «Архів» (опц.) / «Новий пошук». */
export function SearchesPanel({
  isLoading,
  activeSearches,
  archivedSearches,
  selectedId,
  onSelect,
  onDeleted,
  newSearchForm,
}: Props) {
  return (
    <Accordion.Root multiple defaultValue={['searches']} variant="plain">
      <SearchGroupAccordionItem
        value="searches"
        icon={<LuListChecks />}
        label="Пошуки"
        badgeColorPalette="blue"
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

      <NewSearchForm form={newSearchForm} />
    </Accordion.Root>
  );
}
