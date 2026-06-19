import { HStack, NativeSelect, Stack, Tag, Text, Wrap } from '@chakra-ui/react';
import { Switch } from '../../ui/switch';

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
 * Відображає перемикач інверсії, список обраних тегів та dropdown для додавання нових.
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
  return (
    <Stack gap={2}>
      <HStack justify="space-between">
        <Text fontWeight="medium">{title}</Text>
        <Switch
          size="sm"
          colorPalette="orange"
          checked={isInverted}
          onCheckedChange={(d) => onInvertChange(d.checked)}
        >
          Інвертувати
        </Switch>
      </HStack>
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

      <NativeSelect.Root size="sm">
        <NativeSelect.Field
          value=""
          onChange={(e) => {
            onAdd(e.target.value);
            e.target.value = '';
          }}
        >
          <option value="">{selectPlaceholder || `Додати...`}</option>
          {availableOptions
            .filter((opt) => !selectedItems.includes(opt))
            .map((opt) => (
              <option key={opt} value={opt}>
                {opt}
              </option>
            ))}
        </NativeSelect.Field>
        <NativeSelect.Indicator />
      </NativeSelect.Root>
    </Stack>
  );
}
