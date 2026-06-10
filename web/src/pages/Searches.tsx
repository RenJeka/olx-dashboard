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
  Stack,
  Text,
} from '@chakra-ui/react';
import { LuListChecks, LuPlus, LuRefreshCw } from 'react-icons/lu';
import { toaster } from '../components/ui/toaster';
import { Tooltip } from '../components/ui/tooltip';
import { useSearches, useCreateSearch, useScan } from '../api/client';

interface Props {
  selectedId: number | null;
  onSelect: (id: number) => void;
}

export function Searches({ selectedId, onSelect }: Props) {
  const { data: searches, isLoading } = useSearches();
  const createSearch = useCreateSearch();
  const scan = useScan();

  const [name, setName] = useState('');
  const [query, setQuery] = useState('');
  const [priceFrom, setPriceFrom] = useState('');
  const [priceTo, setPriceTo] = useState('');
  const [scanningId, setScanningId] = useState<number | null>(null);

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

  function runScan(id: number) {
    setScanningId(id);
    scan.mutate(id, {
      onSuccess: (r) =>
        toaster.create({
          type: 'success',
          title: 'Скан завершено',
          description: `Знайдено ${r.found}, нових ${r.new_count}`,
        }),
      onError: (err) =>
        toaster.create({
          type: 'error',
          title: 'Помилка скану',
          description: err instanceof Error ? err.message : String(err),
        }),
      onSettled: () => setScanningId(null),
    });
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
            <HStack
              key={s.id}
              colorPalette="blue"
              justify="space-between"
              gap={1}
              px={2}
              py={1}
              rounded="md"
              cursor="pointer"
              bg={selectedId === s.id ? 'colorPalette.subtle' : undefined}
              _hover={{ bg: selectedId === s.id ? 'colorPalette.subtle' : 'bg.muted' }}
              onClick={() => onSelect(s.id)}
            >
              <Box overflow="hidden" flex="1" minW={0}>
                <Text textStyle="sm" fontWeight="medium" overflow="hidden" textOverflow="ellipsis" whiteSpace="nowrap">
                  {s.name}
                </Text>
                <Text textStyle="xs" color="fg.muted" overflow="hidden" textOverflow="ellipsis" whiteSpace="nowrap">
                  {s.query}
                </Text>
              </Box>
              <Tooltip content="Сканувати">
                <IconButton
                  aria-label="Сканувати"
                  size="2xs"
                  variant="ghost"
                  loading={scanningId === s.id}
                  onClick={(e) => {
                    e.stopPropagation();
                    runScan(s.id);
                  }}
                >
                  <LuRefreshCw />
                </IconButton>
              </Tooltip>
            </HStack>
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
