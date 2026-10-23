import type { ReactNode } from 'react';
import { Stack, Text } from '@chakra-ui/react';
import { Tooltip } from '../../../ui/tooltip';
import type { CategoryTreeNode } from '../../../../utils/categoryCounts';

/** Лічильник біля вузла: скільки покаже таблиця, якщо обрати вузол; OLX-число — у підказці. */
export function CountChip({ node, olxHint }: { node: CategoryTreeNode; olxHint: ReactNode }) {
  const content = (
    <Stack gap={1} maxW="60">
      {/* Інший колір, ніж у числа рядка (accent), — щоб не плутати число OLX з числом «у таблиці». */}
      <Text textStyle="xs">
        На OLX:{' '}
        <Text as="span" color="orange.fg" fontWeight="bold" fontVariantNumeric="tabular-nums">
          {node.olxCount.toLocaleString('uk')}
        </Text>
      </Text>
      {olxHint}
    </Stack>
  );
  return (
    <Tooltip
      content={content}
      openDelay={150}
      closeDelay={80}
      showArrow
      lazyMount
      unmountOnExit
      positioning={{ placement: 'left' }}
    >
      <Text
        as="span"
        flexShrink={0}
        textStyle="sm"
        fontWeight="semibold"
        fontVariantNumeric="tabular-nums"
        lineHeight="1"
        cursor="help"
        color={node.shownCount > 0 ? 'accent.fg' : 'fg.subtle'}
      >
        {node.shownCount.toLocaleString('uk')}
      </Text>
    </Tooltip>
  );
}
