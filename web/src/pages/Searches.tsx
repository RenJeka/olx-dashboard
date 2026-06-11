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
  Progress,
  Stack,
  Text,
} from '@chakra-ui/react';
import {
  LuChevronDown,
  LuChevronUp,
  LuEllipsisVertical,
  LuLayers,
  LuListChecks,
  LuPlus,
  LuRefreshCw,
  LuTrash2,
} from 'react-icons/lu';
import {
  DialogBackdrop,
  DialogBody,
  DialogCloseTrigger,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogRoot,
  DialogTitle,
} from '../components/ui/dialog';
import { toaster } from '../components/ui/toaster';
import { Tooltip } from '../components/ui/tooltip';
import {
  useSearches,
  useCreateSearch,
  useScan,
  useScanStatus,
  useDeleteSearch,
  useReorderSearches,
} from '../api/client';
import type { Search } from '../types';

interface Props {
  selectedId: number | null;
  onSelect: (id: number | null) => void;
}

type ScanState = { id: number; deep: boolean } | null;

// Орієнтовний час на запит глибокого скану: сам запит (1-2с) + амортизована
// пауза між батчами (3-6с раз на BATCH_SIZE=3 запити) ≈ 3с/запит у середньому.
const DEEP_SCAN_SECONDS_PER_REQUEST = 3;

export function Searches({ selectedId, onSelect }: Props) {
  const { data: searches, isLoading } = useSearches();
  const createSearch = useCreateSearch();
  const scan = useScan();

  const [name, setName] = useState('');
  const [query, setQuery] = useState('');
  const [priceFrom, setPriceFrom] = useState('');
  const [priceTo, setPriceTo] = useState('');
  const [scanState, setScanState] = useState<ScanState>(null);

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

  function runScan(id: number, deep: boolean) {
    setScanState({ id, deep });
    scan.mutate(
      { searchId: id, deep },
      {
        onSuccess: (r) =>
          toaster.create({
            type: 'success',
            title: deep ? 'Глибокий скан завершено' : 'Скан завершено',
            description: deep
              ? `Глибокий скан: ${r.requestsUsed} запитів, знайдено ${r.found}, нових ${r.new_count}`
              : `Знайдено ${r.found}, нових ${r.new_count}`,
          }),
        onError: (err) =>
          toaster.create({
            type: 'error',
            title: 'Помилка скану',
            description: err instanceof Error ? err.message : String(err),
          }),
        onSettled: () => setScanState(null),
      },
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
    >
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
                    scanState={scanState}
                    isFirst={index === 0}
                    isLast={index === searches.length - 1}
                    onSelect={() => onSelect(s.id)}
                    onScan={(deep) => runScan(s.id, deep)}
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
    </Flex>
  );
}

interface SearchRowProps {
  search: Search;
  selected: boolean;
  scanState: ScanState;
  isFirst: boolean;
  isLast: boolean;
  onSelect: () => void;
  onScan: (deep: boolean) => void;
  onDeleted: () => void;
}

function SearchRow({
  search,
  selected,
  scanState,
  isFirst,
  isLast,
  onSelect,
  onScan,
  onDeleted,
}: SearchRowProps) {
  const isThisScanning = scanState?.id === search.id;
  const isDeepRunning = isThisScanning && scanState?.deep === true;
  const { data: status } = useScanStatus(search.id, isDeepRunning);
  const [confirmOpen, setConfirmOpen] = useState(false);
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
              loading={isThisScanning}
              onClick={(e) => e.stopPropagation()}
            >
              <LuEllipsisVertical />
            </IconButton>
          </Menu.Trigger>
          <Portal>
            <Menu.Positioner>
              <Menu.Content onClick={(e) => e.stopPropagation()}>
                <Menu.Item value="scan" disabled={isThisScanning} onSelect={() => onScan(false)}>
                  <HStack gap={2}>
                    <LuRefreshCw /> <Text>Сканувати</Text>
                  </HStack>
                </Menu.Item>
                <Menu.Item
                  value="deep-scan"
                  disabled={isThisScanning}
                  onSelect={() => onScan(true)}
                >
                  <HStack gap={2}>
                    <LuLayers /> <Text>Глибокий скан</Text>
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
      {isDeepRunning && status && (
        <Box px={2} pb={1}>
          <Progress.Root
            size="xs"
            colorPalette="blue"
            value={
              status.requests_total == null
                ? null
                : ((status.requests_done ?? 0) / status.requests_total) * 100
            }
          >
            <Progress.Track>
              <Progress.Range />
            </Progress.Track>
          </Progress.Root>
          <Text textStyle="xs" color="fg.muted" mt={0.5}>
            {status.requests_total == null
              ? 'Підготовка…'
              : `Запит ${status.requests_done ?? 0}/${status.requests_total} · ~${Math.round(
                  (status.requests_total - (status.requests_done ?? 0)) *
                    DEEP_SCAN_SECONDS_PER_REQUEST,
                )} с`}
          </Text>
        </Box>
      )}
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
