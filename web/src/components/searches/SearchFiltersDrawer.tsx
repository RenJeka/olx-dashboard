import { Stack, Button } from '@chakra-ui/react';
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
import { toaster } from '../ui/toaster';
import { useFilterOptions, useUpdateSearchFilters } from '../../api';
import { buildLocalFiltersPayload } from '../../utils/localFilters';
import { useLocalFiltersForm } from '../../hooks/useLocalFiltersForm';
import { LOCAL_FILTER_DESCRIPTIONS } from '../../constants';
import { DRAWER_SIZE } from '../../theme';
import { PriceFilter } from './local-filters/PriceFilter';
import { TagsFilter } from './local-filters/TagsFilter';
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
  } = useLocalFiltersForm(open ? search.local_filters : '');

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
          <DrawerTitle>Локальні фільтри — {search.name}</DrawerTitle>
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
                tagColorPalette="green"
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
                tagColorPalette="red"
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
