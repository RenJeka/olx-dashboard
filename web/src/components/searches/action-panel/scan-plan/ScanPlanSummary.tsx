import { Box, HStack, Stack, Text } from '@chakra-ui/react';
import { LuInfo } from 'react-icons/lu';
import { formatDuration, formatNumber } from '../../../../utils/format';
import type { ScanPlan } from '../../../../types';
import { InfoTooltip } from './InfoTooltip';
import { StatChip } from './StatChip';

/** Верх звіту: орієнтовний час повного скану, опорні числа, пояснення сум синонімів і фільтра ціни, минулий скан. */
export function ScanPlanSummary({ plan, priceFilterLabel }: { plan: ScanPlan; priceFilterLabel: string | null }) {
  const multi = plan.perQuery.length > 1;
  return (
    <Stack gap={3}>
      <Stack gap={0}>
        <Text fontSize="4xl" fontWeight="bold" fontFamily="mono" color="warning.fg" lineHeight="1">
          {formatDuration(plan.estimatedDurationSec)}
        </Text>
        <Text fontSize="xs" color="fg.muted">
          орієнтовний час повного скану
        </Text>
      </Stack>
      <HStack gap={2} wrap="wrap">
        {/* Для кількох синонімів головне число — оцінка унікальних після дедупу;
            сума по варіантах стає вторинною з явною міткою «з дублями». */}
        {multi && plan.estimatedUnique != null && (
          <StatChip value={`≈ ${formatNumber(plan.estimatedUnique)}`} label="унікальних (оцінка)" />
        )}
        <StatChip
          value={formatNumber(plan.totalListings)}
          label={multi ? 'сума варіантів · з дублями' : 'оголошень'}
        />
        <StatChip value={formatNumber(plan.remainingRequests)} label="запитів лишилось" />
        {plan.totalBuckets > 0 && (
          <StatChip value={formatNumber(plan.totalBuckets)} label="діапазонів" />
        )}
        {plan.estimatedNew != null && (
          <StatChip
            value={`≈ ${formatNumber(plan.estimatedNew)}`}
            label={plan.estimatedNewIsSample ? '~нових (за вибіркою)' : '~нових'}
          />
        )}
      </HStack>
      {multi && (
        <HStack gap={1} align="center">
          <Text textStyle="2xs" color="fg.muted">
            «Сума варіантів» рахує дублі між синонімами двічі.
          </Text>
          <InfoTooltip
            content={
              <Stack gap={1.5}>
                <Text fontSize="2xs">
                  Те саме оголошення під «біговел» і «беговел» враховане окремо. У базі
                  після злиття по olx_id лишиться
                  {plan.estimatedUnique != null ? ` ≈ ${formatNumber(plan.estimatedUnique)} ` : ' '}
                  унікальних.
                </Text>
                <Text fontSize="2xs">
                  На сайті OLX один рядок пошуку вже об'єднує словоформи, тож його число
                  більше за окремий синонім, але менше за цю суму — це не пропажа даних.
                </Text>
              </Stack>
            }
          />
        </HStack>
      )}
      {priceFilterLabel && (
        <HStack
          gap={1.5}
          align="start"
          p={2.5}
          rounded="md"
          bg="bg.subtle"
          borderWidth="1px"
          borderColor="border.muted"
        >
          <Box as={LuInfo} color="fg.muted" fontSize="xs" mt="2px" flexShrink={0} />
          <Text fontSize="2xs" color="fg.default" lineHeight="1.4">
            Усі числа — лише в межах вашого фільтра ціни{' '}
            <Text as="span" fontWeight="semibold">{priceFilterLabel}</Text>.
            {plan.unfilteredTotal != null && (
              <>
                {' '}На OLX без фільтра ціни (по «{plan.perQuery[0]?.query}») —{' '}
                <Text as="span" fontWeight="semibold">~{formatNumber(plan.unfilteredTotal)}</Text>.
                Менше число у звіті — це ваш фільтр, а не недозбір.
              </>
            )}
          </Text>
        </HStack>
      )}
      {plan.lastScanUnique != null && (
        <Text textStyle="2xs" color="fg.muted">
          Минулий скан:{' '}
          {plan.lastScanRaw != null ? `${formatNumber(plan.lastScanRaw)} сирих → ` : ''}
          {formatNumber(plan.lastScanUnique)} унікальних у базі.
        </Text>
      )}
    </Stack>
  );
}
