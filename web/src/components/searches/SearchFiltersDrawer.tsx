import { Stack, Button, HStack, Icon, Text } from '@chakra-ui/react';
import { LuLayers } from 'react-icons/lu';
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
import { Tooltip } from '../ui/tooltip';
import { toaster } from '../ui/toaster';
import { useFilterOptions, useUpdateSearchFilters, useListings } from '../../api';
import { buildLocalFiltersPayload, evaluateLocalFilters } from '../../utils/localFilters';
import { parsePriceRange, formatPriceRange } from '../../utils/format';
import { useLocalFiltersForm } from '../../hooks/useLocalFiltersForm';
import { useListingsUiStore } from '../../stores/listingsUiStore';
import { passesNoiseFilters } from '../../utils/listingVisibility';
import { LOCAL_FILTER_DESCRIPTIONS } from '../../constants';
import { DRAWER_SIZE } from '../../theme';
import { PriceFilter } from './local-filters/PriceFilter';
import { TagsFilter } from './local-filters/TagsFilter';
import { CategoryFilter } from './local-filters/CategoryFilter';
import type { Search } from '../../types';

interface Props {
  search: Search;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/** Drawer редактора локальних фільтрів пошуку: ціна / місто / продавець / плюси / мінуси. */
export function SearchFiltersDrawer({ search, open, onOpenChange }: Props) {
  const { data: filterOptions } = useFilterOptions(search.id, open);
  const updateFilters = useUpdateSearchFilters();

  const {
    state,
    setPriceMin,
    setPriceMax,
    setPriceInvert,
    setCitiesInvert,
    addCity,
    removeCity,
    setSellersInvert,
    addSeller,
    removeSeller,
    setProsInvert,
    addPro,
    removePro,
    setConsInvert,
    addCon,
    removeCon,
    setCategoriesInvert,
    toggleCategories,
  } = useLocalFiltersForm(open ? search.local_filters : '');

  // Контекст для пояснення розриву «наших / OLX» у фільтрі категорій.
  const priceRange = parsePriceRange(search.api_filters);
  const priceFilterLabel = priceRange ? formatPriceRange(priceRange.from, priceRange.to) : null;
  let synonymCount = 0;
  try {
    const parsed = JSON.parse(search.query_synonyms || '[]');
    synonymCount = Array.isArray(parsed) ? parsed.length : 0;
  } catch {
    synonymCount = 0;
  }

  // Зведений лічильник «Всього» — скільки оголошень покаже таблиця з ПОТОЧНИМИ (незбереженими)
  // локальними фільтрами + перемикачами «показати приховані/нерелевантні». Вкладка статусу не
  // враховується (це = майбутнє число вкладки «Всі»). Рахується в пам'яті з завантажених listings.
  const { data: listings } = useListings(open ? search.id : null);
  const showFilteredOut = useListingsUiStore((s) => s.showFilteredOut);
  const showIrrelevant = useListingsUiStore((s) => s.showIrrelevant);
  const previewFilters = buildLocalFiltersPayload(state);
  const shownTotal = (listings ?? []).reduce((n, l) => {
    // Прев'ю незбережених фільтрів накладаємо як синтетичний filtered_out, далі — той самий
    // предикат шуму, що й таблиця (єдине джерело видимості, CLAUDE.md): якщо passesNoiseFilters
    // зміниться, цей лічильник лишиться узгодженим з реальною таблицею.
    const previewListing = { ...l, filtered_out: evaluateLocalFilters(previewFilters, l) ? 1 : 0 };
    return passesNoiseFilters(previewListing, showFilteredOut, showIrrelevant) ? n + 1 : n;
  }, 0);
  const totalTooltip =
    'Скільки оголошень покаже таблиця з цими фільтрами (враховано перемикачі «показати приховані/нерелевантні»). Поточну вкладку статусу не враховано.';

  function handleSave() {
    const local_filters = buildLocalFiltersPayload(state);

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
    <DrawerRoot size={DRAWER_SIZE.default} open={open} onOpenChange={(d) => onOpenChange(d.open)}>
      <DrawerBackdrop />
      <DrawerContent>
        <DrawerCloseTrigger />
        <DrawerHeader>
          <HStack justify="space-between" align="center" gap={3}>
            <DrawerTitle>Локальні фільтри — {search.name}</DrawerTitle>
            <Tooltip content={totalTooltip} openDelay={150} closeDelay={80} positioning={{ placement: 'bottom' }}>
              <HStack
                as="span"
                gap={1.5}
                px={2.5}
                py={1}
                borderRadius="full"
                bg="bg.muted"
                borderWidth="1px"
                borderColor="border.subtle"
                cursor="help"
                flexShrink={0}
              >
                <Icon as={LuLayers} boxSize={3.5} color="fg.muted" />
                <Text textStyle="xs" color="fg.muted">
                  Всього
                </Text>
                <Text
                  textStyle="sm"
                  fontWeight="bold"
                  color="accent.fg"
                  fontVariantNumeric="tabular-nums"
                >
                  {shownTotal.toLocaleString('uk')}
                </Text>
              </HStack>
            </Tooltip>
          </HStack>
        </DrawerHeader>
        <DrawerBody>
          <Stack gap={6}>
            <PriceFilter
              priceMin={state.priceMin}
              priceMax={state.priceMax}
              priceInvert={state.priceInvert}
              onPriceMinChange={setPriceMin}
              onPriceMaxChange={setPriceMax}
              onPriceInvertChange={setPriceInvert}
            />

            <CategoryFilter
              searchId={search.id}
              categories={filterOptions?.categories ?? []}
              selectedIds={state.categories}
              isInverted={state.categoriesInvert}
              priceFilterLabel={priceFilterLabel}
              synonymCount={synonymCount}
              onToggle={toggleCategories}
              onInvertChange={setCategoriesInvert}
            />

            <TagsFilter
              title="Місто"
              descriptionNormal={LOCAL_FILTER_DESCRIPTIONS.cities.normal}
              descriptionInvert={LOCAL_FILTER_DESCRIPTIONS.cities.invert}
              selectedItems={state.cities}
              availableOptions={filterOptions?.cities ?? []}
              isInverted={state.citiesInvert}
              onAdd={addCity}
              onRemove={removeCity}
              onInvertChange={setCitiesInvert}
              selectPlaceholder="Додати місто…"
            />

            <TagsFilter
              title="Продавець"
              descriptionNormal={LOCAL_FILTER_DESCRIPTIONS.sellers.normal}
              descriptionInvert={LOCAL_FILTER_DESCRIPTIONS.sellers.invert}
              selectedItems={state.sellers}
              availableOptions={filterOptions?.sellers ?? []}
              isInverted={state.sellersInvert}
              onAdd={addSeller}
              onRemove={removeSeller}
              onInvertChange={setSellersInvert}
              selectPlaceholder="Додати продавця…"
            />

            {filterOptions && filterOptions.pros.length > 0 && (
              <TagsFilter
                title="Плюси"
                descriptionNormal={LOCAL_FILTER_DESCRIPTIONS.pros.normal}
                descriptionInvert={LOCAL_FILTER_DESCRIPTIONS.pros.invert}
                selectedItems={state.pros}
                availableOptions={filterOptions.pros}
                isInverted={state.prosInvert}
                onAdd={addPro}
                onRemove={removePro}
                onInvertChange={setProsInvert}
                tagColorPalette="success"
                selectPlaceholder="Додати плюс…"
              />
            )}

            {filterOptions && filterOptions.cons.length > 0 && (
              <TagsFilter
                title="Мінуси"
                descriptionNormal={LOCAL_FILTER_DESCRIPTIONS.cons.normal}
                descriptionInvert={LOCAL_FILTER_DESCRIPTIONS.cons.invert}
                selectedItems={state.cons}
                availableOptions={filterOptions.cons}
                isInverted={state.consInvert}
                onAdd={addCon}
                onRemove={removeCon}
                onInvertChange={setConsInvert}
                tagColorPalette="danger"
                selectPlaceholder="Додати мінус…"
              />
            )}
          </Stack>
        </DrawerBody>
        <DrawerFooter>
          <Button colorPalette="accent" loading={updateFilters.isPending} onClick={handleSave}>
            Зберегти
          </Button>
        </DrawerFooter>
      </DrawerContent>
    </DrawerRoot>
  );
}
