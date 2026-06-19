import { useEffect, useState } from 'react';
import { Button, Field, HStack, Input, Stack } from '@chakra-ui/react';
import { LuLayers } from 'react-icons/lu';
import {
  DialogBackdrop,
  DialogBody,
  DialogCloseTrigger,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogRoot,
  DialogTitle,
} from '../ui/dialog';
import { SearchVariantsDialog } from './SearchVariantsDialog';
import { toaster } from '../ui/toaster';
import { useUpdateSearch } from '../../api/client';
import { parsePriceRange } from '../../utils/format';
import { parseSearchSynonyms } from '../../utils/searchSynonyms';
import type { Search } from '../../types';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  search: Search;
}

/**
 * Діалог редагування пошуку: назва, запит, діапазон цін і синоніми (варіанти пошуку).
 * Дзеркало форми «Новий пошук»; зберігає через PATCH (useUpdateSearch). Контрольований
 * (відкриття керує викликач — пункт меню «Редагувати» у SearchRow).
 */
export function SearchEditDialog({ open, onOpenChange, search }: Props) {
  const [name, setName] = useState('');
  const [query, setQuery] = useState('');
  const [priceFrom, setPriceFrom] = useState('');
  const [priceTo, setPriceTo] = useState('');
  const [synonyms, setSynonyms] = useState<string[]>([]);
  const [variantsOpen, setVariantsOpen] = useState(false);
  const updateSearch = useUpdateSearch();

  // Префіл при відкритті з поточного пошуку.
  useEffect(() => {
    if (!open) return;
    setName(search.name);
    setQuery(search.query);
    const range = parsePriceRange(search.api_filters);
    setPriceFrom(range?.from != null ? String(range.from) : '');
    setPriceTo(range?.to != null ? String(range.to) : '');
    setSynonyms(parseSearchSynonyms(search.query_synonyms));
  }, [open, search]);

  function handleSave() {
    if (!name.trim() || !query.trim()) return;

    // Зберігаємо інші ключі api_filters; оновлюємо лише ranges.price.
    let apiFilters: { ranges?: Record<string, unknown> } = {};
    try {
      apiFilters = JSON.parse(search.api_filters || '{}');
    } catch {
      apiFilters = {};
    }
    const from = priceFrom ? Number(priceFrom) : undefined;
    const to = priceTo ? Number(priceTo) : undefined;
    const ranges = { ...(apiFilters.ranges ?? {}) };
    if (from != null || to != null) ranges.price = { from, to };
    else delete ranges.price;
    apiFilters.ranges = ranges;

    updateSearch.mutate(
      {
        searchId: search.id,
        name: name.trim(),
        query: query.trim(),
        api_filters: apiFilters,
        query_synonyms: synonyms,
      },
      {
        onSuccess: () => {
          onOpenChange(false);
          toaster.create({ type: 'success', title: 'Пошук оновлено', description: name.trim() });
        },
        onError: (err) =>
          toaster.create({
            type: 'error',
            title: 'Помилка оновлення',
            description: err instanceof Error ? err.message : String(err),
          }),
      },
    );
  }

  return (
    <>
      <DialogRoot
        open={open}
        onOpenChange={(d) => onOpenChange(d.open)}
        size="md"
        placement="center"
        scrollBehavior="inside"
      >
        <DialogBackdrop />
        <DialogContent>
          <DialogCloseTrigger />
          <DialogHeader>
            <DialogTitle>Редагувати пошук</DialogTitle>
          </DialogHeader>
          <DialogBody>
            <Stack gap={3}>
              <Field.Root required>
                <Field.Label>
                  Назва <Field.RequiredIndicator />
                </Field.Label>
                <Input size="sm" value={name} onChange={(e) => setName(e.target.value)} />
              </Field.Root>
              <Field.Root required>
                <Field.Label>
                  Запит <Field.RequiredIndicator />
                </Field.Label>
                <Input size="sm" value={query} onChange={(e) => setQuery(e.target.value)} />
              </Field.Root>
              <Button
                size="xs"
                variant="outline"
                alignSelf="start"
                disabled={!query.trim()}
                onClick={() => setVariantsOpen(true)}
              >
                <LuLayers /> Варіанти пошуку{synonyms.length > 0 ? ` (${synonyms.length})` : ''}
              </Button>
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
            </Stack>
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Скасувати
            </Button>
            <Button
              colorPalette="blue"
              loading={updateSearch.isPending}
              disabled={!name.trim() || !query.trim()}
              onClick={handleSave}
            >
              Зберегти
            </Button>
          </DialogFooter>
        </DialogContent>
      </DialogRoot>

      <SearchVariantsDialog
        open={variantsOpen}
        onOpenChange={setVariantsOpen}
        query={query}
        value={synonyms}
        onChange={setSynonyms}
      />
    </>
  );
}
