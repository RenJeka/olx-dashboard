import { Box, HStack, Stack, Text } from '@chakra-ui/react';
import { LuTriangleAlert } from 'react-icons/lu';
import { formatNumber } from '../../../../utils/format';
import type { ScanPlanQuery } from '../../../../types';
import { PriceSpectrum } from './PriceSpectrum';
import { describeFallback } from './scanPlanText';

/** Один варіант запиту (основний query чи синонім): підпис, ціновий спектр, внесок, причина fallback. */
export function QuerySection({ q, showLabel }: { q: ScanPlanQuery; showLabel: boolean }) {
  return (
    <Stack gap={1.5}>
      {showLabel && (
        <HStack justify="space-between">
          <Text fontSize="xs" fontWeight="semibold" color="fg.default" lineClamp={1}>
            «{q.query}»
          </Text>
          <Text fontSize="2xs" color="fg.muted" flexShrink={0}>
            {q.rootCount != null ? `${formatNumber(q.rootCount)} оголошень` : '—'}
            {q.buckets.length > 1 ? ` · ${q.buckets.length} діапазонів` : ''}
          </Text>
        </HStack>
      )}
      <PriceSpectrum q={q} />
      {showLabel && q.sampleUnique != null && (
        <Text fontSize="2xs" color="fg.muted">
          внесок: ~{formatNumber(q.sampleUnique)} унікальних у вибірці
        </Text>
      )}
      {q.fallbackReason && (
        <HStack gap={1.5} align="start">
          <Box as={LuTriangleAlert} color="warning.fg" fontSize="xs" mt="2px" flexShrink={0} />
          <Text fontSize="2xs" color="warning.fg" lineHeight="1.4">
            {describeFallback(q.fallbackReason)}
          </Text>
        </HStack>
      )}
    </Stack>
  );
}
