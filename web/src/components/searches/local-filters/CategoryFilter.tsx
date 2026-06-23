import { useMemo } from 'react';
import { Badge, Box, HStack, Stack, Text } from '@chakra-ui/react';
import { Checkbox } from '../../ui/checkbox';
import { Switch } from '../../ui/switch';
import { useListings } from '../../../api';
import {
  buildCategoryCountMap,
  buildCategoryTree,
  countUncategorized,
  flattenTree,
} from '../../../utils/categoryCounts';
import { LOCAL_FILTER_DESCRIPTIONS } from '../../../constants';
import type { CategoryOption } from '../../../types';

interface Props {
  searchId: number;
  categories: CategoryOption[];
  /** Обрані листові category_id. */
  selectedIds: number[];
  isInverted: boolean;
  /** Додати/прибрати набір листових id (вибір цілої гілки чи листа). */
  onToggle: (ids: number[], checked: boolean) => void;
  onInvertChange: (val: boolean) => void;
}

/**
 * Фільтр категорій: дерево «категорія → підкатегорія» з кількістю оголошень біля кожного
 * вузла. Лічильники рахуються в пам'яті з уже завантажених listings (0 запитів до БД).
 * Вибір вузла = вибір усіх листових category_id під ним; між групами фільтрів — AND.
 */
export function CategoryFilter({
  searchId,
  categories,
  selectedIds,
  isInverted,
  onToggle,
  onInvertChange,
}: Props) {
  const { data: listings } = useListings(searchId);

  const { rows, uncategorized } = useMemo(() => {
    const all = listings ?? [];
    const countMap = buildCategoryCountMap(all);
    const tree = buildCategoryTree(categories, countMap);
    return { rows: flattenTree(tree), uncategorized: countUncategorized(all) };
  }, [listings, categories]);

  if (categories.length === 0) {
    return (
      <Stack gap={2}>
        <Text fontWeight="medium">Категорії</Text>
        <Text textStyle="xs" color="fg.muted">
          {uncategorized > 0
            ? `Категорії ще не зібрано (${uncategorized} оголошень). Запустіть скан — вони заповняться.`
            : 'Категорії ще не зібрано. Запустіть скан.'}
        </Text>
      </Stack>
    );
  }

  const selected = new Set(selectedIds);

  return (
    <Stack gap={2}>
      <HStack justify="space-between">
        <Text fontWeight="medium">Категорії</Text>
        <Switch
          size="sm"
          colorPalette="warning"
          checked={isInverted}
          onCheckedChange={(d) => onInvertChange(d.checked)}
        >
          Інвертувати
        </Switch>
      </HStack>
      <Text textStyle="xs" color="fg.muted">
        {isInverted
          ? LOCAL_FILTER_DESCRIPTIONS.categories.invert
          : LOCAL_FILTER_DESCRIPTIONS.categories.normal}
      </Text>

      <Stack gap={1}>
        {rows.map((node) => {
          const allSelected = node.leafIds.every((id) => selected.has(id));
          const someSelected = !allSelected && node.leafIds.some((id) => selected.has(id));
          const checkedState: boolean | 'indeterminate' = allSelected
            ? true
            : someSelected
              ? 'indeterminate'
              : false;

          return (
            <Box key={node.key} pl={`${node.depth * 1.25}rem`}>
              <HStack justify="space-between" gap={2}>
                <Checkbox
                  size="sm"
                  checked={checkedState}
                  onCheckedChange={(d) => onToggle(node.leafIds, d.checked === true)}
                >
                  <Text textStyle="sm" fontWeight={node.depth === 0 ? 'medium' : 'normal'}>
                    {node.label}
                  </Text>
                </Checkbox>
                <Badge size="sm" variant="subtle" colorPalette="gray">
                  {node.count}
                </Badge>
              </HStack>
            </Box>
          );
        })}
      </Stack>

      {uncategorized > 0 && (
        <Text textStyle="xs" color="fg.muted">
          Без категорії: {uncategorized} (заповняться при наступному скані).
        </Text>
      )}
    </Stack>
  );
}
