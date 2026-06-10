import { useState } from 'react';
import {
  Box,
  Button,
  Field,
  Heading,
  HStack,
  Input,
  Stack,
  Text,
} from '@chakra-ui/react';
import { toaster } from '../components/ui/toaster';
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
    });
  }

  return (
    <Stack
      as="aside"
      w="80"
      flexShrink={0}
      borderRightWidth="1px"
      borderColor="border.subtle"
      p={4}
      gap={6}
      overflowY="auto"
    >
      <Box>
        <Heading size="md" mb={3}>
          Пошуки
        </Heading>
        {isLoading && (
          <Text textStyle="sm" color="fg.muted">
            Завантаження…
          </Text>
        )}
        <Stack gap={1}>
          {searches?.map((s) => (
            <Box key={s.id}>
              <Button
                onClick={() => onSelect(s.id)}
                variant={selectedId === s.id ? 'subtle' : 'ghost'}
                colorPalette={selectedId === s.id ? 'blue' : 'gray'}
                w="full"
                h="auto"
                py={2}
                justifyContent="flex-start"
              >
                <Stack gap={0} align="flex-start">
                  <Text textStyle="sm" fontWeight="medium">
                    {s.name}
                  </Text>
                  <Text textStyle="xs" color="fg.muted" fontWeight="normal">
                    {s.query}
                  </Text>
                </Stack>
              </Button>
              <Button
                onClick={() => runScan(s.id)}
                loading={scan.isPending}
                loadingText="Сканування…"
                size="xs"
                variant="plain"
                colorPalette="blue"
                ml={3}
              >
                Scan
              </Button>
            </Box>
          ))}
        </Stack>
      </Box>

      <Stack as="form" onSubmit={submit} gap={3}>
        <Heading size="sm">Новий пошук</Heading>
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
        <Button
          type="submit"
          loading={createSearch.isPending}
          colorPalette="blue"
          size="sm"
        >
          Створити
        </Button>
        {createSearch.isError && (
          <Text textStyle="xs" color="fg.error">
            {createSearch.error instanceof Error
              ? createSearch.error.message
              : 'Помилка створення'}
          </Text>
        )}
      </Stack>
    </Stack>
  );
}
