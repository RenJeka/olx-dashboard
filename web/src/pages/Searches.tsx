import { useState } from 'react';
import {
  Box,
  Button,
  Field,
  Flex,
  Heading,
  HStack,
  IconButton,
  Input,
  Progress,
  Stack,
  Text,
} from '@chakra-ui/react';
import { LuLayers, LuListChecks, LuPlus, LuRefreshCw } from 'react-icons/lu';
import { toaster } from '../components/ui/toaster';
import { Tooltip } from '../components/ui/tooltip';
import { useSearches, useCreateSearch, useScan, useScanStatus } from '../api/client';
import type { Search } from '../types';

interface Props {
  selectedId: number | null;
  onSelect: (id: number) => void;
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
      overflow="hidden"
      borderRightWidth="1px"
      borderColor="border.subtle"
    >
      <Heading size="md" px={4} pt={4} pb={2} display="flex" alignItems="center" gap={2}>
        <LuListChecks /> Пошуки
      </Heading>

      <Box maxH="40vh" overflowY="auto" px={2} pb={2}>
        {isLoading && (
          <Text textStyle="sm" color="fg.muted" px={2}>
            Завантаження…
          </Text>
        )}
        <Stack gap="0.5">
          {searches?.map((s) => (
            <SearchRow
              key={s.id}
              search={s}
              selected={selectedId === s.id}
              scanState={scanState}
              onSelect={() => onSelect(s.id)}
              onScan={(deep) => runScan(s.id, deep)}
            />
          ))}
        </Stack>
      </Box>

      <Stack
        as="form"
        onSubmit={submit}
        gap={3}
        p={4}
        borderTopWidth="1px"
        borderColor="border.subtle"
      >
        <Heading size="sm" display="flex" alignItems="center" gap={2}>
          <LuPlus /> Новий пошук
        </Heading>
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
    </Flex>
  );
}

interface SearchRowProps {
  search: Search;
  selected: boolean;
  scanState: ScanState;
  onSelect: () => void;
  onScan: (deep: boolean) => void;
}

function SearchRow({ search, selected, scanState, onSelect, onScan }: SearchRowProps) {
  const isThisScanning = scanState?.id === search.id;
  const isNormalRunning = isThisScanning && scanState?.deep === false;
  const isDeepRunning = isThisScanning && scanState?.deep === true;
  const { data: status } = useScanStatus(search.id, isDeepRunning);

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
        <Tooltip content="Сканувати">
          <IconButton
            aria-label="Сканувати"
            size="2xs"
            variant="ghost"
            loading={isNormalRunning}
            disabled={isThisScanning}
            onClick={(e) => {
              e.stopPropagation();
              onScan(false);
            }}
          >
            <LuRefreshCw />
          </IconButton>
        </Tooltip>
        <Tooltip content="Глибокий скан: більше сторінок з паузами, може зайняти 1–2 хв">
          <IconButton
            aria-label="Глибокий скан"
            size="2xs"
            variant="ghost"
            loading={isDeepRunning}
            disabled={isThisScanning}
            onClick={(e) => {
              e.stopPropagation();
              onScan(true);
            }}
          >
            <LuLayers />
          </IconButton>
        </Tooltip>
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
    </Box>
  );
}
