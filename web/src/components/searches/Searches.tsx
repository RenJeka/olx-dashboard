import { useState } from 'react';
import { Flex } from '@chakra-ui/react';
import {
  DrawerBackdrop,
  DrawerBody,
  DrawerCloseTrigger,
  DrawerContent,
  DrawerHeader,
  DrawerRoot,
  DrawerTitle,
} from '../ui/drawer';
import { SearchCreateDialog } from './SearchCreateDialog';
import { SearchVariantsDialog } from './SearchVariantsDialog';
import { SearchesPanel } from './SearchesPanel';
import { useSearches } from '../../api';
import { useIsMobile } from '../../hooks/useIsMobile';
import { useNewSearchForm } from '../../hooks/useNewSearchForm';
import { useSettingsStore } from '../../stores/settingsStore';

/** Бічна панель «Пошуки»: акордеон активних/архівованих пошуків + кнопка «+» → модалка створення. */
export function Searches() {
  const selectedId = useSettingsStore((s) => s.selectedSearchId);
  const onSelect = useSettingsStore((s) => s.setSelectedSearchId);
  const visible = useSettingsStore((s) => s.searchesVisible);
  const onVisibleChange = useSettingsStore((s) => s.setSearchesVisible);

  const isMobile = useIsMobile();
  const { data: searches, isLoading } = useSearches();
  const [createOpen, setCreateOpen] = useState(false);
  const newSearchForm = useNewSearchForm(() => setCreateOpen(false));

  function handleSelect(id: number) {
    onSelect(id);
    if (isMobile) onVisibleChange?.(false);
  }

  function handleDeleted(id: number) {
    if (selectedId === id) onSelect(null);
  }

  const activeSearches = searches?.filter((s) => s.archived !== 1) ?? [];
  const archivedSearches = searches?.filter((s) => s.archived === 1) ?? [];

  const panel = (
    <SearchesPanel
      isLoading={isLoading}
      activeSearches={activeSearches}
      archivedSearches={archivedSearches}
      selectedId={selectedId}
      onSelect={handleSelect}
      onDeleted={handleDeleted}
      onNewSearch={() => setCreateOpen(true)}
    />
  );

  const dialogs = (
    <>
      <SearchCreateDialog
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        form={newSearchForm}
      />
      <SearchVariantsDialog
        open={newSearchForm.variantsOpen}
        onOpenChange={newSearchForm.setVariantsOpen}
        query={newSearchForm.query}
        value={newSearchForm.synonyms}
        onChange={newSearchForm.setSynonyms}
      />
    </>
  );

  if (isMobile) {
    return (
      <>
        <DrawerRoot
          placement="start"
          size="xs"
          open={visible}
          onOpenChange={(d) => onVisibleChange?.(d.open)}
        >
          <DrawerBackdrop />
          <DrawerContent>
            <DrawerCloseTrigger />
            <DrawerHeader>
              <DrawerTitle>Пошуки</DrawerTitle>
            </DrawerHeader>
            <DrawerBody px={0}>{panel}</DrawerBody>
          </DrawerContent>
        </DrawerRoot>
        {dialogs}
      </>
    );
  }

  return (
    <>
      <Flex
        as="aside"
        direction="column"
        w="80"
        flexShrink={0}
        h="full"
        borderRightWidth="1px"
        borderColor="border.subtle"
        bg="bg.subtle"
        overflowY="auto"
        display={visible ? 'flex' : 'none'}
      >
        {panel}
      </Flex>
      {dialogs}
    </>
  );
}
