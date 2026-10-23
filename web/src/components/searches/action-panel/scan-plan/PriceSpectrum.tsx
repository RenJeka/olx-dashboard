import { Box, HStack, Text } from '@chakra-ui/react';
import { formatNumber } from '../../../../utils/format';
import type { ScanPlanQuery } from '../../../../types';

/**
 * Сигнатурний елемент звіту: «ціновий спектр» — горизонтальна стрічка на весь ціновий
 * діапазон варіанта запиту. Ширина сегмента ∝ ширині цінового діапазону бакету, інтенсивність
 * ∝ кількості оголошень у ньому. `noSplit` — суцільний блок без розбиття (малий пошук).
 */
export function PriceSpectrum({ q }: { q: ScanPlanQuery }) {
  if (q.noSplit) {
    return (
      <HStack
        h="28px"
        rounded="md"
        bg="warning.subtle"
        borderWidth="1px"
        borderColor="warning.muted"
        px={3}
        role="img"
        aria-label={q.rootCount != null ? `Без розбиття: ${q.rootCount} оголошень` : 'Без розбиття на цінові діапазони'}
      >
        {q.rootCount != null && (
          <Text fontSize="2xs" color="warning.fg" fontWeight="semibold">
            {formatNumber(q.rootCount)} оголошень
          </Text>
        )}
      </HStack>
    );
  }

  const maxCount = Math.max(1, ...q.buckets.map((b) => b.count));

  return (
    <HStack
      gap="2px"
      h="28px"
      w="full"
      role="img"
      aria-label={`Ціновий спектр: ${q.buckets.length} діапазонів від ${formatNumber(q.buckets[0]?.from ?? 0)} грн`}
    >
      {q.buckets.map((b, idx) => {
        const width = Math.max(b.to != null ? b.to - b.from : 1, 1);
        const intensity = 0.3 + 0.7 * (b.count / maxCount);
        const rangeLabel = `${formatNumber(b.from)}–${b.to != null ? formatNumber(b.to) : '∞'} грн`;
        return (
          <Box
            key={idx}
            flex={width}
            minW="3px"
            h="full"
            rounded="sm"
            bg="warning.solid"
            opacity={intensity}
            title={`${rangeLabel}: ${formatNumber(b.count)} оголошень`}
            aria-label={`${rangeLabel}: ${formatNumber(b.count)} оголошень`}
          />
        );
      })}
    </HStack>
  );
}
