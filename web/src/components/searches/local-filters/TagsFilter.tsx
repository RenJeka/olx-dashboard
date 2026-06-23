import { useMemo, useState } from 'react';
import { Combobox, Portal, Stack, Tag, Text, Wrap, createListCollection } from '@chakra-ui/react';
import { Switch } from '../../ui/switch';
import { CollapsibleFilter } from './CollapsibleFilter';

interface Props {
  title: string;
  descriptionNormal: string;
  descriptionInvert: string;
  selectedItems: string[];
  availableOptions: string[];
  isInverted: boolean;
  onAdd: (item: string) => void;
  onRemove: (item: string) => void;
  onInvertChange: (val: boolean) => void;
  tagColorPalette?: string;
  selectPlaceholder?: string;
}

/**
 * Універсальний компонент локального фільтра на основі тегів (Міста, Продавці, Плюси, Мінуси).
 * Перемикач інверсії + список обраних тегів + Combobox з пошуком для додавання нових
 * (фільтрація опцій по введеному тексту — корисно для довгих списків міст/продавців).
 */
export function TagsFilter({
  title,
  descriptionNormal,
  descriptionInvert,
  selectedItems,
  availableOptions,
  isInverted,
  onAdd,
  onRemove,
  onInvertChange,
  tagColorPalette,
  selectPlaceholder,
}: Props) {
  const [inputValue, setInputValue] = useState('');

  // Опції для додавання: ще не обрані + збіг із введеним текстом (пошук без урахування регістру).
  const filtered = useMemo(() => {
    const q = inputValue.trim().toLowerCase();
    return availableOptions
      .filter((opt) => !selectedItems.includes(opt))
      .filter((opt) => q === '' || opt.toLowerCase().includes(q));
  }, [availableOptions, selectedItems, inputValue]);

  const collection = useMemo(
    () => createListCollection({ items: filtered.map((opt) => ({ label: opt, value: opt })) }),
    [filtered],
  );

  // Combobox працює як «додавалка»: після вибору додаємо елемент і очищаємо поле/пошук.
  const handleSelect = (picked: string | undefined) => {
    if (picked) onAdd(picked);
    setInputValue('');
  };

  const invertSwitch = (
    <Switch
      size="sm"
      colorPalette="warning"
      checked={isInverted}
      onCheckedChange={(d) => onInvertChange(d.checked)}
    >
      Інвертувати
    </Switch>
  );

  return (
    <CollapsibleFilter title={title} actions={invertSwitch}>
      <Stack gap={2}>
        <Text textStyle="xs" color="fg.muted">
          {isInverted ? descriptionInvert : descriptionNormal}
        </Text>

        {selectedItems.length > 0 && (
          <Wrap gap={2}>
            {selectedItems.map((item) => (
              <Tag.Root key={item} size="md" colorPalette={tagColorPalette}>
                <Tag.Label>{item}</Tag.Label>
                <Tag.EndElement>
                  <Tag.CloseTrigger onClick={() => onRemove(item)} />
                </Tag.EndElement>
              </Tag.Root>
            ))}
          </Wrap>
        )}

        <Combobox.Root
          size="sm"
          collection={collection}
          value={[]}
          inputValue={inputValue}
          onInputValueChange={(e) => setInputValue(e.inputValue)}
          onValueChange={(e) => handleSelect(e.value[0])}
          selectionBehavior="clear"
          openOnClick
          positioning={{ sameWidth: true }}
        >
          <Combobox.Control>
            <Combobox.Input placeholder={selectPlaceholder || 'Додати…'} />
            <Combobox.IndicatorGroup>
              <Combobox.Trigger />
            </Combobox.IndicatorGroup>
          </Combobox.Control>
          <Portal>
            <Combobox.Positioner>
              <Combobox.Content maxH="14rem" overflowY="auto">
                <Combobox.Empty>Нічого не знайдено</Combobox.Empty>
                {collection.items.map((item) => (
                  <Combobox.Item item={item} key={item.value}>
                    {item.label}
                  </Combobox.Item>
                ))}
              </Combobox.Content>
            </Combobox.Positioner>
          </Portal>
        </Combobox.Root>
      </Stack>
    </CollapsibleFilter>
  );
}
