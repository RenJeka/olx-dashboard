import { useState } from 'react';
import { Box, HStack, Icon, Stack, Text } from '@chakra-ui/react';
import { LuChevronDown, LuChevronRight } from 'react-icons/lu';
import { Checkbox } from '../../ui/checkbox';
import { Switch } from '../../ui/switch';
import { Tooltip } from '../../ui/tooltip';
import { CollapsibleFilter } from './CollapsibleFilter';
import { useCategoryTree } from '../../../hooks/useCategoryTree';
import { nodeCheckedState, type CategoryTreeNode } from '../../../utils/categoryCounts';
import { pluralUk } from '../../../utils/format';
import { LOCAL_FILTER_DESCRIPTIONS } from '../../../constants';
import type { CategoryOption } from '../../../types';

/** Відступ на рівень вкладеності дерева категорій (rem). */
const TREE_INDENT_REM = 1.25;

interface Props {
  searchId: number;
  categories: CategoryOption[];
  /** Обрані листові category_id. */
  selectedIds: number[];
  isInverted: boolean;
  /** Підпис фільтра ціни пошуку (для пояснення розриву наших/OLX). null — фільтр не задано. */
  priceFilterLabel: string | null;
  /** Кількість синонімів запиту (для пояснення розриву наших/OLX). */
  synonymCount: number;
  /** Додати/прибрати набір листових id (вибір цілої гілки чи листа). */
  onToggle: (ids: number[], checked: boolean) => void;
  onInvertChange: (val: boolean) => void;
}

/** Парний лічильник «наших / OLX» біля вузла — синє число (наших) + приглушене (OLX). */
function CountChip({ node }: { node: CategoryTreeNode }) {
  const hasLocal = node.localCount > 0;
  return (
    <HStack
      gap={1}
      flexShrink={0}
      fontVariantNumeric="tabular-nums"
      lineHeight="1"
      alignItems="baseline"
    >
      <Text textStyle="sm" fontWeight="semibold" color={hasLocal ? 'accent.fg' : 'fg.subtle'}>
        {node.localCount.toLocaleString('uk')}
      </Text>
      <Text textStyle="xs" color="fg.subtle" aria-hidden>
        /
      </Text>
      <Text textStyle="xs" color="fg.subtle">
        {node.olxCount.toLocaleString('uk')}
      </Text>
    </HStack>
  );
}

interface RowProps {
  node: CategoryTreeNode;
  collapsed: Set<string>;
  selected: Set<number>;
  onToggleCollapse: (key: string) => void;
  onToggle: (ids: number[], checked: boolean) => void;
}

/** Рядок дерева категорій: chevron (для гілок) + чекбокс + назва + лічильник; рекурсивно діти. */
function CategoryRow({ node, collapsed, selected, onToggleCollapse, onToggle }: RowProps) {
  const hasChildren = node.children.length > 0;
  const isCollapsed = collapsed.has(node.key);

  return (
    <>
      <Box
        pl={`${node.depth * TREE_INDENT_REM}rem`}
        borderRadius="sm"
        transition="background 0.12s"
        _hover={{ bg: 'bg.muted' }}
      >
        <HStack justify="space-between" gap={3} py={1} pr={1.5}>
          <HStack gap={1} minW={0}>
            {hasChildren ? (
              <Box
                as="button"
                onClick={() => onToggleCollapse(node.key)}
                aria-label={isCollapsed ? 'Розгорнути' : 'Згорнути'}
                display="flex"
                alignItems="center"
                justifyContent="center"
                w="4"
                flexShrink={0}
                color="fg.muted"
                _hover={{ color: 'fg' }}
              >
                <Icon as={isCollapsed ? LuChevronRight : LuChevronDown} boxSize={3.5} />
              </Box>
            ) : (
              <Box w="4" flexShrink={0} />
            )}
            <Checkbox
              size="sm"
              checked={nodeCheckedState(node, selected)}
              onCheckedChange={(d) => onToggle(node.leafIds, d.checked === true)}
            >
              <Text textStyle="sm" fontWeight={node.depth === 0 ? 'medium' : 'normal'}>
                {node.label}
              </Text>
            </Checkbox>
          </HStack>
          <CountChip node={node} />
        </HStack>
      </Box>

      {hasChildren &&
        !isCollapsed &&
        node.children.map((child) => (
          <CategoryRow
            key={child.key}
            node={child}
            collapsed={collapsed}
            selected={selected}
            onToggleCollapse={onToggleCollapse}
            onToggle={onToggle}
          />
        ))}
    </>
  );
}

/**
 * Фільтр категорій: згортуване дерево «категорія → підкатегорія» з парним лічильником
 * «наших / OLX» біля кожного вузла. «наших» рахується в пам'яті (useCategoryTree), «OLX» —
 * з кешованого facet. Вибір вузла = вибір усіх category_id під ним; між групами фільтрів — AND.
 */
export function CategoryFilter({
  searchId,
  categories,
  selectedIds,
  isInverted,
  priceFilterLabel,
  synonymCount,
  onToggle,
  onInvertChange,
}: Props) {
  const { tree, uncategorized } = useCategoryTree(searchId, categories);
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

  const oursTooltip = (
    <Stack gap={1} maxW="60">
      <Text textStyle="xs">
        Якщо число <b>менше</b> за OLX — це вплив фільтра ціни{' '}
        {priceFilterLabel ? `(${priceFilterLabel})` : '(не задано)'}.
      </Text>
      <Text textStyle="xs">
        Якщо <b>більше</b> — це вплив синонімів ({synonymCount}{' '}
        {pluralUk(synonymCount, ['синонім', 'синоніми', 'синонімів'])}).
      </Text>
    </Stack>
  );

  const olxTooltip = (
    <Stack gap={1} maxW="60">
      <Text textStyle="xs">Без фільтра ціни і синонімів.</Text>
      <Text textStyle="xs" color="fg.subtle">
        Жива видача OLX за основним запитом.
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

      {/* Легенда парного числа біля рядків — вирівняна по правому краю на рівні чисел. */}
      <HStack
        justify="flex-end"
        gap={1.5}
        pr={1.5}
        pb={1.5}
        textStyle="2xs"
        color="fg.subtle"
        borderBottomWidth="1px"
        borderColor="border.subtle"
      >
        <Tooltip content={oursTooltip} openDelay={150} closeDelay={80} showArrow positioning={{ placement: 'top' }}>
          <Box as="span" color="accent.fg" fontWeight="semibold" cursor="help" textDecoration="underline" textDecorationStyle="dotted" textUnderlineOffset="2px">
            наших
          </Box>
        </Tooltip>
        <Text aria-hidden>/</Text>
        <Tooltip content={olxTooltip} openDelay={150} closeDelay={80} showArrow positioning={{ placement: 'top' }}>
          <Box as="span" cursor="help" textDecoration="underline" textDecorationStyle="dotted" textUnderlineOffset="2px">
            на OLX
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
            onToggleCollapse={toggleCollapse}
            onToggle={onToggle}
          />
        ))}
      </Stack>

      {uncategorized > 0 && (
        <Text textStyle="2xs" color="fg.subtle">
          Без категорії: {uncategorized} (заповняться при наступному скані).
        </Text>
      )}
      </Stack>
    </CollapsibleFilter>
  );
}
