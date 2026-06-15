import { useState } from 'react';
import {
  Accordion,
  Badge,
  Box,
  Button,
  Field,
  Flex,
  HStack,
  IconButton,
  Input,
  Menu,
  Portal,
  Stack,
  Text,
} from '@chakra-ui/react';
import {
  LuChevronDown,
  LuChevronUp,
  LuEllipsisVertical,
  LuFilter,
  LuListChecks,
  LuPlus,
  LuTrash2,
} from 'react-icons/lu';
import { SearchFiltersDrawer } from './SearchFiltersDrawer';
import {
  DialogBackdrop,
  DialogBody,
  DialogCloseTrigger,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogRoot,
  DialogTitle,
} from './ui/dialog';
import {
  DrawerBackdrop,
  DrawerBody,
  DrawerCloseTrigger,
  DrawerContent,
  DrawerHeader,
  DrawerRoot,
  DrawerTitle,
} from './ui/drawer';
import { toaster } from './ui/toaster';
import { Tooltip } from './ui/tooltip';
import { useSearches, useCreateSearch, useDeleteSearch, useReorderSearches } from '../api/client';
import { useIsMobile } from '../hooks/useIsMobile';
import type { Search } from '../types';

interface Props {
  selectedId: number | null;
  onSelect: (id: number | null) => void;
  visible?: boolean;
  onVisibleChange?: (visible: boolean) => void;
}

export function Searches({ selectedId, onSelect, visible = true, onVisibleChange }: Props) {
  const isMobile = useIsMobile();
  const { data: searches, isLoading } = useSearches();
  const createSearch = useCreateSearch();

  const [name, setName] = useState('');
  const [query, setQuery] = useState('');
  const [priceFrom, setPriceFrom] = useState('');
  const [priceTo, setPriceTo] = useState('');

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !query.trim()) return;
    createSearch.mutate(
      {
        name: name.trim(),
        query: query.trim(),
        priceFrom: priceFrom ? Number(priceFrom) : undefined,
        priceTo: priceTo ? Number(priceTo) : undefined,
      },
      {
        onSuccess: () => {
          setName('');
          setQuery('');
          setPriceFrom('');
          setPriceTo('');
        },
      },
    );
  }

  function handleSelect(id: number | null) {
    onSelect(id);
    if (isMobile) onVisibleChange?.(false);
  }

  const content = (
    <Accordion.Root multiple defaultValue={['searches']} variant="plain">
      <Accordion.Item value="searches" borderBottomWidth="1px" borderColor="border.subtle">
        <Accordion.ItemTrigger px={4} py={3} cursor="pointer" _hover={{ bg: 'bg.muted' }}>
          <HStack flex="1" gap={2} fontWeight="semibold">
            <LuListChecks />
            <Text>Пошуки</Text>
            {searches && searches.length > 0 && (
              <Badge colorPalette="blue" variant="subtle" rounded="full">
                {searches.length}
              </Badge>
            )}
          </HStack>
          <Accordion.ItemIndicator />
        </Accordion.ItemTrigger>
        <Accordion.ItemContent>
          <Accordion.ItemBody px={2} pt={0} pb={2}>
            {isLoading && (
              <Text textStyle="sm" color="fg.muted" px={2}>
                Завантаження…
              </Text>
            )}
            {!isLoading && (!searches || searches.length === 0) && (
              <Text textStyle="sm" color="fg.muted" px={2}>
                Поки що порожньо — додай перший пошук нижче.
              </Text>
            )}
            <Stack gap="0.5">
              {searches?.map((s, index) => (
                <SearchRow
                  key={s.id}
                  search={s}
                  selected={selectedId === s.id}
                  isFirst={index === 0}
                  isLast={index === searches.length - 1}
                  onSelect={() => handleSelect(s.id)}
                  onDeleted={() => {
                    if (selectedId === s.id) onSelect(null);
                  }}
                />
              ))}
            </Stack>
          </Accordion.ItemBody>
        </Accordion.ItemContent>
      </Accordion.Item>

      <Accordion.Item value="new" borderBottomWidth="1px" borderColor="border.subtle">
        <Accordion.ItemTrigger px={4} py={3} cursor="pointer" _hover={{ bg: 'bg.muted' }}>
          <HStack flex="1" gap={2} fontWeight="semibold">
            <LuPlus />
            <Text>Новий пошук</Text>
          </HStack>
          <Accordion.ItemIndicator />
        </Accordion.ItemTrigger>
        <Accordion.ItemContent>
          <Accordion.ItemBody pt={0}>
            <Stack as="form" onSubmit={submit} gap={3} px={2}>
              <Field.Root required>
                <Field.Label>
                  Назва <Field.RequiredIndicator />
                </Field.Label>
                <Input
                  size="sm"
                  placeholder="напр. iPhone 13 Київ"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </Field.Root>
              <Field.Root required>
                <Field.Label>
                  Запит <Field.RequiredIndicator />
                </Field.Label>
                <Input
                  size="sm"
                  placeholder="напр. iphone 13"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
              </Field.Root>
              <HStack gap={2}>
                <Field.Root>
                  <Field.Label>Ціна від</Field.Label>
                  <Input
                    size="sm"
                    inputMode="numeric"
                    value={priceFrom}
                    onChange={(e) => setPriceFrom(e.target.value)}
                  />
                </Field.Root>
                <Field.Root>
                  <Field.Label>Ціна до</Field.Label>
                  <Input
                    size="sm"
                    inputMode="numeric"
                    value={priceTo}
                    onChange={(e) => setPriceTo(e.target.value)}
                  />
                </Field.Root>
              </HStack>
              <Button type="submit" loading={createSearch.isPending} colorPalette="blue" size="sm">
                <LuPlus /> Створити
              </Button>
              {createSearch.isError && (
                <Text textStyle="xs" color="fg.error">
                  {createSearch.error instanceof Error
                    ? createSearch.error.message
                    : 'Помилка створення'}
                </Text>
              )}
            </Stack>
          </Accordion.ItemBody>
        </Accordion.ItemContent>
      </Accordion.Item>
    </Accordion.Root>
  );

  if (isMobile) {
    return (
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
          <DrawerBody px={0}>{content}</DrawerBody>
        </DrawerContent>
      </DrawerRoot>
    );
  }

  return (
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
      {content}
    </Flex>
  );
}

interface SearchRowProps {
  search: Search;
  selected: boolean;
  isFirst: boolean;
  isLast: boolean;
  onSelect: () => void;
  onDeleted: () => void;
}

function SearchRow({ search, selected, isFirst, isLast, onSelect, onDeleted }: SearchRowProps) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const deleteSearch = useDeleteSearch();
  const reorderSearch = useReorderSearches();

  function handleDelete() {
    deleteSearch.mutate(search.id, {
      onSuccess: () => {
        setConfirmOpen(false);
        onDeleted();
        toaster.create({ type: 'success', title: 'Пошук видалено', description: search.name });
      },
      onError: (err) =>
        toaster.create({
          type: 'error',
          title: 'Помилка видалення',
          description: err instanceof Error ? err.message : String(err),
        }),
    });
  }

  function handleMove(direction: 'up' | 'down') {
    reorderSearch.mutate({ searchId: search.id, direction });
  }

  return (
    <Box>
      <HStack
        colorPalette="blue"
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
          <Text textStyle="sm" fontWeight="medium" overflow="hidden" textOverflow="ellipsis" whiteSpace="nowrap">
            {search.name}
          </Text>
          <Text textStyle="xs" color="fg.muted" overflow="hidden" textOverflow="ellipsis" whiteSpace="nowrap">
            {search.query}
          </Text>
        </Box>
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
        <Menu.Root positioning={{ placement: 'bottom-end' }}>
          <Menu.Trigger asChild>
            <IconButton
              aria-label="Дії з пошуком"
              size="2xs"
              variant="ghost"
              onClick={(e) => e.stopPropagation()}
            >
              <LuEllipsisVertical />
            </IconButton>
          </Menu.Trigger>
          <Portal>
            <Menu.Positioner>
              <Menu.Content onClick={(e) => e.stopPropagation()}>
                <Menu.Item value="filters" onSelect={() => setFiltersOpen(true)}>
                  <HStack gap={2}>
                    <LuFilter /> <Text>Фільтри</Text>
                  </HStack>
                </Menu.Item>
                <Menu.Separator />
                <Menu.Item value="delete" color="fg.error" onSelect={() => setConfirmOpen(true)}>
                  <HStack gap={2}>
                    <LuTrash2 /> <Text>Видалити</Text>
                  </HStack>
                </Menu.Item>
              </Menu.Content>
            </Menu.Positioner>
          </Portal>
        </Menu.Root>
      </HStack>
      <SearchFiltersDrawer search={search} open={filtersOpen} onOpenChange={setFiltersOpen} />
      <DialogRoot
        role="alertdialog"
        placement="center"
        size="sm"
        open={confirmOpen}
        onOpenChange={(d) => setConfirmOpen(d.open)}
      >
        <DialogBackdrop />
        <DialogContent>
          <DialogCloseTrigger />
          <DialogHeader>
            <DialogTitle>Видалити пошук «{search.name}»?</DialogTitle>
          </DialogHeader>
          <DialogBody>
            <Text>
              Усі збережені оголошення та історія цін для цього пошуку також будуть видалені
              безповоротно.
            </Text>
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmOpen(false)}>
              Скасувати
            </Button>
            <Button
              colorPalette="red"
              loading={deleteSearch.isPending}
              onClick={handleDelete}
            >
              Видалити
            </Button>
          </DialogFooter>
        </DialogContent>
      </DialogRoot>
    </Box>
  );
}
