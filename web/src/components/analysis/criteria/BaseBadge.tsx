import { Badge, Text } from '@chakra-ui/react';
import { Tooltip } from '../../ui/tooltip';
import type { CriterionBase } from '../../../types';

/** Підказка базового пункту: з якої категорії OLX він успадкований. */
export function baseHint(base: CriterionBase): string {
  return `Базовий пункт категорії «${base.label}»`;
}

interface Props {
  base: CriterionBase;
  size?: 'xs' | 'sm';
  /** Власний тултіп; `false` — коли підказку вже показує батьківський елемент (чип майстра). */
  tooltip?: boolean;
  /** Замість «базовий» — назва категорії-джерела (вікно «Базові плюси й мінуси», розділ «Успадковано»). */
  showSource?: boolean;
}

/** Бейдж «базовий» (docs/plans/old/base-criteria.md): вікно «Плюси та мінуси», крок 1 майстра, базові набори. */
export function BaseBadge({ base, size = 'sm', tooltip = true, showSource = false }: Props) {
  const badge = (
    <Badge
      size={size}
      colorPalette="accent"
      variant="subtle"
      flexShrink={0}
      maxW="200px"
      // Фокус з клавіатури (Tab) відкриває підказку; без власної підказки (чип майстра — кнопка) не фокусується.
      tabIndex={tooltip ? 0 : undefined}
      focusVisibleRing="outside"
    >
      <Text as="span" truncate>
        {showSource ? base.label : 'базовий'}
      </Text>
    </Badge>
  );
  if (!tooltip) return badge;
  return (
    <Tooltip content={baseHint(base)} openDelay={300}>
      {badge}
    </Tooltip>
  );
}
