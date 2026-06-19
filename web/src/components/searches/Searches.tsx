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
import { SearchVariantsDialog } from './SearchVariantsDialog';
import { SearchesPanel } from './SearchesPanel';
import { useSearches } from '../../api/client';
import { useIsMobile } from '../../hooks/useIsMobile';
import { useNewSearchForm } from '../../hooks/useNewSearchForm';

interface Props {
  selectedId: number | null;
  onSelect: (id: number | null) => void;
  visible?: boolean;
  onVisibleChange?: (visible: boolean) => void;
}

/** Бічна панель «Пошуки»: акордеон активних/архівованих пошуків + форма створення нового. */
export function Searches({ selectedId, onSelect, visible = true, onVisibleChange }: Props) {
  const isMobile = useIsMobile();
  const { data: searches, isLoading } = useSearches();
  const newSearchForm = useNewSearchForm();

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
      newSearchForm={newSearchForm}
    />
  );

  const variantsDialog = (
    <SearchVariantsDialog
      open={newSearchForm.variantsOpen}
      onOpenChange={newSearchForm.setVariantsOpen}
      query={newSearchForm.query}
      value={newSearchForm.synonyms}
      onChange={newSearchForm.setSynonyms}
    />
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
        {variantsDialog}
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
      {variantsDialog}
    </>
  );
}
