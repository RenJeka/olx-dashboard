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
} from '../ui/drawer';
import { Switch } from '../ui/switch';
import { toaster } from '../ui/toaster';
import { useFilterOptions, useUpdateSearchFilters } from '../../api/client';
import { parseLocalFilters } from '../../utils/localFilters';
import type { LocalFilters, Search } from '../../types';

interface Props {
  search: Search;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/** Drawer редактора локальних фільтрів пошуку: ціна / місто / продавець / плюси / мінуси. */
export function SearchFiltersDrawer({ search, open, onOpenChange }: Props) {
  const { data: filterOptions } = useFilterOptions(search.id, open);
  const updateFilters = useUpdateSearchFilters();

  // ── Значення фільтрів ─────────────────────────────────────────────────────
  const [priceMin, setPriceMin] = useState('');
  const [priceMax, setPriceMax] = useState('');
  const [cities, setCities] = useState<string[]>([]);
  const [sellers, setSellers] = useState<string[]>([]);
  const [pros, setPros] = useState<string[]>([]);
  const [cons, setCons] = useState<string[]>([]);

  // ── Режим інверсії для кожної групи ──────────────────────────────────────
  const [priceInvert, setPriceInvert] = useState(false);
  const [citiesInvert, setCitiesInvert] = useState(false);
  const [sellersInvert, setSellersInvert] = useState(false);
  const [prosInvert, setProsInvert] = useState(false);
  const [consInvert, setConsInvert] = useState(false);

  useEffect(() => {
    if (!open) return;
    const filters = parseLocalFilters(search.local_filters);
    setPriceMin(filters.price_range?.min != null ? String(filters.price_range.min) : '');
    setPriceMax(filters.price_range?.max != null ? String(filters.price_range.max) : '');
    setCities(filters.cities ?? []);
    setSellers(filters.sellers ?? []);
    setPros(filters.pros ?? []);
    setCons(filters.cons ?? []);
    const inv = filters.invert ?? {};
    setPriceInvert(inv.price_range ?? false);
    setCitiesInvert(inv.cities ?? false);
    setSellersInvert(inv.sellers ?? false);
    setProsInvert(inv.pros ?? false);
    setConsInvert(inv.cons ?? false);
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

  function addPro(criterion: string) {
    if (!criterion || pros.includes(criterion)) return;
    setPros((prev) => [...prev, criterion]);
  }

  function removePro(criterion: string) {
    setPros((prev) => prev.filter((p) => p !== criterion));
  }

  function addCon(criterion: string) {
    if (!criterion || cons.includes(criterion)) return;
    setCons((prev) => [...prev, criterion]);
  }

  function removeCon(criterion: string) {
    setCons((prev) => prev.filter((c) => c !== criterion));
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
    if (pros.length > 0) local_filters.pros = pros;
    if (cons.length > 0) local_filters.cons = cons;

    // Зберігаємо invert лише для груп, де є значення і прапорець true
    const invert: LocalFilters['invert'] = {};
    if (local_filters.price_range && priceInvert) invert.price_range = true;
    if (local_filters.cities && citiesInvert) invert.cities = true;
    if (local_filters.sellers && sellersInvert) invert.sellers = true;
    if (local_filters.pros && prosInvert) invert.pros = true;
    if (local_filters.cons && consInvert) invert.cons = true;
    if (Object.keys(invert).length > 0) local_filters.invert = invert;

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

            {/* ── Діапазон цін ───────────────────────────────────────────── */}
            <Stack gap={2}>
              <HStack justify="space-between">
                <Text fontWeight="medium">Діапазон цін</Text>
                <Switch
                  size="sm"
                  colorPalette="orange"
                  checked={priceInvert}
                  onCheckedChange={(d) => setPriceInvert(d.checked)}
                >
                  Інвертувати
                </Switch>
              </HStack>
              <Text textStyle="xs" color="fg.muted">
                {priceInvert
                  ? 'Оголошення з ціною в межах діапазону — будуть приховані.'
                  : 'Оголошення з ціною поза межами діапазону — будуть приховані.'}
                {' '}Оголошення без ціни цим правилом не приховуються.
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

            {/* ── Місто ──────────────────────────────────────────────────── */}
            <Stack gap={2}>
              <HStack justify="space-between">
                <Text fontWeight="medium">Місто</Text>
                <Switch
                  size="sm"
                  colorPalette="orange"
                  checked={citiesInvert}
                  onCheckedChange={(d) => setCitiesInvert(d.checked)}
                >
                  Інвертувати
                </Switch>
              </HStack>
              <Text textStyle="xs" color="fg.muted">
                {citiesInvert
                  ? 'Оголошення з обраних міст — будуть приховані.'
                  : 'Якщо обрано хоча б одне місто — показуються лише оголошення з цих міст.'}
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

            {/* ── Продавець ──────────────────────────────────────────────── */}
            <Stack gap={2}>
              <HStack justify="space-between">
                <Text fontWeight="medium">Продавець</Text>
                <Switch
                  size="sm"
                  colorPalette="orange"
                  checked={sellersInvert}
                  onCheckedChange={(d) => setSellersInvert(d.checked)}
                >
                  Інвертувати
                </Switch>
              </HStack>
              <Text textStyle="xs" color="fg.muted">
                {sellersInvert
                  ? 'Оголошення обраних продавців — будуть приховані.'
                  : 'Якщо обрано хоча б одного продавця — показуються лише оголошення цих продавців.'}
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

            {/* ── Плюси ──────────────────────────────────────────────────── */}
            {filterOptions && filterOptions.pros.length > 0 && (
              <Stack gap={2}>
                <HStack justify="space-between">
                  <Text fontWeight="medium">Плюси</Text>
                  <Switch
                    size="sm"
                    colorPalette="orange"
                    checked={prosInvert}
                    onCheckedChange={(d) => setProsInvert(d.checked)}
                  >
                    Інвертувати
                  </Switch>
                </HStack>
                <Text textStyle="xs" color="fg.muted">
                  {prosInvert
                    ? 'Оголошення з обраними плюсами — будуть приховані. Необрані — показуються.'
                    : 'Показуються лише оголошення з обраними плюсами. Необрані — приховуються.'}
                </Text>
                <Wrap gap={2}>
                  {pros.map((criterion) => (
                    <Tag.Root key={criterion} size="md" colorPalette="green">
                      <Tag.Label>{criterion}</Tag.Label>
                      <Tag.EndElement>
                        <Tag.CloseTrigger onClick={() => removePro(criterion)} />
                      </Tag.EndElement>
                    </Tag.Root>
                  ))}
                </Wrap>
                <NativeSelect.Root size="sm">
                  <NativeSelect.Field
                    value=""
                    onChange={(e) => {
                      addPro(e.target.value);
                      e.target.value = '';
                    }}
                  >
                    <option value="">Додати плюс…</option>
                    {filterOptions.pros
                      .filter((c) => !pros.includes(c))
                      .map((c) => (
                        <option key={c} value={c}>
                          {c}
                        </option>
                      ))}
                  </NativeSelect.Field>
                  <NativeSelect.Indicator />
                </NativeSelect.Root>
              </Stack>
            )}

            {/* ── Мінуси ─────────────────────────────────────────────────── */}
            {filterOptions && filterOptions.cons.length > 0 && (
              <Stack gap={2}>
                <HStack justify="space-between">
                  <Text fontWeight="medium">Мінуси</Text>
                  <Switch
                    size="sm"
                    colorPalette="orange"
                    checked={consInvert}
                    onCheckedChange={(d) => setConsInvert(d.checked)}
                  >
                    Інвертувати
                  </Switch>
                </HStack>
                <Text textStyle="xs" color="fg.muted">
                  {consInvert
                    ? `Оголошення з обраними мінусами — будуть приховані. Необрані — показуються.`
                    : `Показуються лише оголошення з обраними мінусами. Необрані — приховуються.`}
                </Text>
                <Wrap gap={2}>
                  {cons.map((criterion) => (
                    <Tag.Root key={criterion} size="md" colorPalette="red">
                      <Tag.Label>{criterion}</Tag.Label>
                      <Tag.EndElement>
                        <Tag.CloseTrigger onClick={() => removeCon(criterion)} />
                      </Tag.EndElement>
                    </Tag.Root>
                  ))}
                </Wrap>
                <NativeSelect.Root size="sm">
                  <NativeSelect.Field
                    value=""
                    onChange={(e) => {
                      addCon(e.target.value);
                      e.target.value = '';
                    }}
                  >
                    <option value="">Додати мінус…</option>
                    {filterOptions.cons
                      .filter((c) => !cons.includes(c))
                      .map((c) => (
                        <option key={c} value={c}>
                          {c}
                        </option>
                      ))}
                  </NativeSelect.Field>
                  <NativeSelect.Indicator />
                </NativeSelect.Root>
              </Stack>
            )}

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
