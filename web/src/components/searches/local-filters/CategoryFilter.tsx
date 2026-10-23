import { useState } from 'react';
import { Box, Button, HStack, Icon, Stack, Text } from '@chakra-ui/react';
import { LuChevronsDownUp, LuChevronsUpDown } from 'react-icons/lu';
import { Switch } from '../../ui/switch';
import { Tooltip } from '../../ui/tooltip';
import { CollapsibleFilter } from './CollapsibleFilter';
import { CategoryRow } from './category-tree/CategoryRow';
import { useCategoryTree } from '../../../hooks/useCategoryTree';
import { collectBranchKeys } from '../../../utils/categoryCounts';
import { pluralUk } from '../../../utils/format';
import { LOCAL_FILTER_DESCRIPTIONS } from '../../../constants';
import type { CategoryOption, Listing } from '../../../types';

interface Props {
  /**
   * Оголошення, які покаже таблиця з поточними фільтрами БЕЗ групи «Категорії» (рахує
   * SearchFiltersDrawer) — база лічильників дерева.
   */
  listings: Listing[];
  categories: CategoryOption[];
  /** Обрані листові category_id. */
  selectedIds: number[];
  isInverted: boolean;
  /** Підпис фільтра ціни пошуку (для підказки OLX-числа). null — фільтр не задано. */
  priceFilterLabel: string | null;
  /** Кількість синонімів запиту (для підказки OLX-числа). */
  synonymCount: number;
  /** Додати/прибрати набір листових id (вибір цілої гілки чи листа). */
  onToggle: (ids: number[], checked: boolean) => void;
  onInvertChange: (val: boolean) => void;
}

/**
 * Фільтр категорій: згортуване дерево «категорія → підкатегорія» з лічильником біля кожного вузла —
 * скільки оголошень покаже таблиця, якщо обрати цей вузол (решта фільтрів і перемикачі шуму
 * враховані, фільтр категорій — ні; рахує useCategoryTree). Число OLX (кешований facet) — у підказці.
 * Вибір вузла = вибір усіх category_id під ним; між групами фільтрів — AND.
 */
export function CategoryFilter({
  listings,
  categories,
  selectedIds,
  isInverted,
  priceFilterLabel,
  synonymCount,
  onToggle,
  onInvertChange,
}: Props) {
  const { tree, uncategorized, outsideTree } = useCategoryTree(listings, categories);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  const toggleCollapse = (key: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  if (categories.length === 0) {
    return (
      <CollapsibleFilter title="Категорії">
        <Text textStyle="xs" color="fg.muted">
          {uncategorized > 0
            ? `Категорії ще не зібрано (${uncategorized} оголошень). Запустіть скан — вони заповняться.`
            : 'Категорії ще не зібрано. Запустіть скан.'}
        </Text>
      </CollapsibleFilter>
    );
  }

  const selected = new Set(selectedIds);
  const branchKeys = collectBranchKeys(tree);
  // Хоч одна гілка розгорнута → кнопка згортає все; усі згорнуті → розгортає.
  const anyExpanded = branchKeys.some((key) => !collapsed.has(key));
  const toggleAll = () => setCollapsed(anyExpanded ? new Set(branchKeys) : new Set());

  const olxHint = (
    <Text textStyle="xs" color="fg.subtle">
      Про число OLX: жива видача за основним запитом — без фільтра ціни пошуку{' '}
      {priceFilterLabel ? `(${priceFilterLabel})` : '(не задано)'} і без синонімів ({synonymCount}{' '}
      {pluralUk(synonymCount, ['синонім', 'синоніми', 'синонімів'])}).
    </Text>
  );

  const countTooltip = (
    <Stack gap={1} maxW="64">
      <Text textStyle="xs">
        Скільки оголошень покаже таблиця, якщо обрати цю категорію: враховано решту фільтрів (ціна, місто,
        продавець, плюси, мінуси) і перемикачі «показати приховані / нерелевантні».
      </Text>
      <Text textStyle="xs">Без обраних категорій сума верхніх рядків = «Всього».</Text>
      <Text textStyle="xs" color="fg.subtle">
        Число на OLX — у підказці при наведенні на число.
      </Text>
    </Stack>
  );

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
    <CollapsibleFilter title="Категорії" actions={invertSwitch}>
      <Stack gap={2.5}>
      <Text textStyle="xs" color="fg.muted">
        {isInverted
          ? LOCAL_FILTER_DESCRIPTIONS.categories.invert
          : LOCAL_FILTER_DESCRIPTIONS.categories.normal}
      </Text>

      {/* Легенда над деревом: «Згорнути / розгорнути все» ліворуч, підпис колонки чисел праворуч. */}
      <HStack
        justify="space-between"
        gap={3}
        pr={1.5}
        pb={1.5}
        borderBottomWidth="1px"
        borderColor="border.subtle"
      >
        {branchKeys.length > 0 ? (
          <Button size="2xs" variant="ghost" color="fg.muted" onClick={toggleAll}>
            <Icon as={anyExpanded ? LuChevronsDownUp : LuChevronsUpDown} boxSize={3.5} />
            {anyExpanded ? 'Згорнути все' : 'Розгорнути все'}
          </Button>
        ) : (
          <Box />
        )}
        <Tooltip content={countTooltip} openDelay={150} closeDelay={80} showArrow positioning={{ placement: 'top' }}>
          <Box
            as="span"
            textStyle="2xs"
            color="accent.fg"
            fontWeight="semibold"
            cursor="help"
            textDecoration="underline"
            textDecorationStyle="dotted"
            textUnderlineOffset="2px"
          >
            у таблиці
          </Box>
        </Tooltip>
      </HStack>

      <Stack gap={0.5}>
        {tree.map((node) => (
          <CategoryRow
            key={node.key}
            node={node}
            collapsed={collapsed}
            selected={selected}
            olxHint={olxHint}
            onToggleCollapse={toggleCollapse}
            onToggle={onToggle}
          />
        ))}
      </Stack>

      {uncategorized > 0 && (
        <Text textStyle="2xs" color="fg.subtle">
          Без категорії: {uncategorized.toLocaleString('uk')} (заповняться при наступному скані).
        </Text>
      )}
      {outsideTree > 0 && (
        <Text textStyle="2xs" color="fg.subtle">
          Інші категорії: {outsideTree.toLocaleString('uk')} (їх немає в дереві OLX за основним запитом,
          тож обрати їх тут не можна).
        </Text>
      )}
      </Stack>
    </CollapsibleFilter>
  );
}
