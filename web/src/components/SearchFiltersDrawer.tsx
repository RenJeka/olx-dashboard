import { useEffect, useState } from 'react';
import { HStack, Input, NativeSelect, Stack, Tag, Text, Wrap, Button } from '@chakra-ui/react';
import {
  DrawerBackdrop,
  DrawerBody,
  DrawerCloseTrigger,
  DrawerContent,
  DrawerFooter,
  DrawerHeader,
  DrawerRoot,
  DrawerTitle,
} from './ui/drawer';
import { toaster } from './ui/toaster';
import { useFilterOptions, useUpdateSearchFilters } from '../api/client';
import type { LocalFilters, Search } from '../types';

interface Props {
  search: Search;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function parseLocalFilters(raw: string): LocalFilters {
  try {
    return JSON.parse(raw || '{}') as LocalFilters;
  } catch {
    return {};
  }
}

/** Drawer редактора локальних фільтрів пошуку: ціна / місто / продавець. */
export function SearchFiltersDrawer({ search, open, onOpenChange }: Props) {
  const { data: filterOptions } = useFilterOptions(search.id, open);
  const updateFilters = useUpdateSearchFilters();

  const [priceMin, setPriceMin] = useState('');
  const [priceMax, setPriceMax] = useState('');
  const [cities, setCities] = useState<string[]>([]);
  const [sellers, setSellers] = useState<string[]>([]);

  useEffect(() => {
    if (!open) return;
    const filters = parseLocalFilters(search.local_filters);
    setPriceMin(filters.price_range?.min != null ? String(filters.price_range.min) : '');
    setPriceMax(filters.price_range?.max != null ? String(filters.price_range.max) : '');
    setCities(filters.cities ?? []);
    setSellers(filters.sellers ?? []);
  }, [open, search.local_filters]);

  function addCity(city: string) {
    if (!city || cities.includes(city)) return;
    setCities((prev) => [...prev, city]);
  }

  function removeCity(city: string) {
    setCities((prev) => prev.filter((c) => c !== city));
  }

  function addSeller(seller: string) {
    if (!seller || sellers.includes(seller)) return;
    setSellers((prev) => [...prev, seller]);
  }

  function removeSeller(seller: string) {
    setSellers((prev) => prev.filter((s) => s !== seller));
  }

  function handleSave() {
    const local_filters: LocalFilters = {};

    const priceRange: { min?: number; max?: number } = {};
    if (priceMin.trim() !== '') priceRange.min = Number(priceMin);
    if (priceMax.trim() !== '') priceRange.max = Number(priceMax);
    if (priceRange.min !== undefined || priceRange.max !== undefined) {
      local_filters.price_range = priceRange;
    }

    if (cities.length > 0) local_filters.cities = cities;
    if (sellers.length > 0) local_filters.sellers = sellers;

    updateFilters.mutate(
      { searchId: search.id, local_filters },
      {
        onSuccess: (result) =>
          toaster.create({
            type: 'success',
            title: 'Фільтри збережено',
            description: `Перераховано: ${result.filtered_out_count ?? 0} приховано`,
          }),
        onError: (err) =>
          toaster.create({
            type: 'error',
            title: 'Помилка збереження фільтрів',
            description: err instanceof Error ? err.message : String(err),
          }),
      },
    );
  }

  return (
    <DrawerRoot size="sm" open={open} onOpenChange={(d) => onOpenChange(d.open)}>
      <DrawerBackdrop />
      <DrawerContent>
        <DrawerCloseTrigger />
        <DrawerHeader>
          <DrawerTitle>Локальні фільтри — {search.name}</DrawerTitle>
        </DrawerHeader>
        <DrawerBody>
          <Stack gap={6}>
            <Stack gap={2}>
              <Text fontWeight="medium">Діапазон цін</Text>
              <Text textStyle="xs" color="fg.muted">
                Оголошення з ціною поза межами діапазону — будуть приховані. Оголошення без
                ціни цим правилом не приховуються.
              </Text>
              <HStack gap={2}>
                <Input
                  size="sm"
                  w="120px"
                  placeholder="мін"
                  inputMode="decimal"
                  value={priceMin}
                  onChange={(e) => setPriceMin(e.target.value)}
                />
                <Input
                  size="sm"
                  w="120px"
                  placeholder="макс"
                  inputMode="decimal"
                  value={priceMax}
                  onChange={(e) => setPriceMax(e.target.value)}
                />
              </HStack>
            </Stack>

            <Stack gap={2}>
              <Text fontWeight="medium">Місто</Text>
              <Text textStyle="xs" color="fg.muted">
                Якщо обрано хоча б одне місто — показуються лише оголошення з цих міст.
              </Text>
              <Wrap gap={2}>
                {cities.map((city) => (
                  <Tag.Root key={city} size="md">
                    <Tag.Label>{city}</Tag.Label>
                    <Tag.EndElement>
                      <Tag.CloseTrigger onClick={() => removeCity(city)} />
                    </Tag.EndElement>
                  </Tag.Root>
                ))}
              </Wrap>
              <NativeSelect.Root size="sm">
                <NativeSelect.Field
                  value=""
                  onChange={(e) => {
                    addCity(e.target.value);
                    e.target.value = '';
                  }}
                >
                  <option value="">Додати місто…</option>
                  {filterOptions?.cities
                    .filter((city) => !cities.includes(city))
                    .map((city) => (
                      <option key={city} value={city}>
                        {city}
                      </option>
                    ))}
                </NativeSelect.Field>
                <NativeSelect.Indicator />
              </NativeSelect.Root>
            </Stack>

            <Stack gap={2}>
              <Text fontWeight="medium">Продавець</Text>
              <Text textStyle="xs" color="fg.muted">
                Якщо обрано хоча б одного продавця — показуються лише оголошення цих
                продавців.
              </Text>
              <Wrap gap={2}>
                {sellers.map((seller) => (
                  <Tag.Root key={seller} size="md">
                    <Tag.Label>{seller}</Tag.Label>
                    <Tag.EndElement>
                      <Tag.CloseTrigger onClick={() => removeSeller(seller)} />
                    </Tag.EndElement>
                  </Tag.Root>
                ))}
              </Wrap>
              <NativeSelect.Root size="sm">
                <NativeSelect.Field
                  value=""
                  onChange={(e) => {
                    addSeller(e.target.value);
                    e.target.value = '';
                  }}
                >
                  <option value="">Додати продавця…</option>
                  {filterOptions?.sellers
                    .filter((seller) => !sellers.includes(seller))
                    .map((seller) => (
                      <option key={seller} value={seller}>
                        {seller}
                      </option>
                    ))}
                </NativeSelect.Field>
                <NativeSelect.Indicator />
              </NativeSelect.Root>
            </Stack>
          </Stack>
        </DrawerBody>
        <DrawerFooter>
          <Button colorPalette="blue" loading={updateFilters.isPending} onClick={handleSave}>
            Зберегти
          </Button>
        </DrawerFooter>
      </DrawerContent>
    </DrawerRoot>
  );
}
