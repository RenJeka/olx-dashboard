import { Stack, Text } from '@chakra-ui/react';

/** Невелика статистична картка в стилі ScanWarningSummary (warning.subtle + мono-цифра). */
export function StatChip({ value, label }: { value: string; label: string }) {
  return (
    <Stack gap={0} lineHeight="1.1" minW="20" px={3} py={2} rounded="md" bg="warning.subtle" borderWidth="1px" borderColor="warning.muted">
      <Text fontSize="lg" fontWeight="bold" fontFamily="mono" color="warning.fg">
        {value}
      </Text>
      <Text fontSize="2xs" color="fg.muted" textTransform="uppercase" letterSpacing="wide">
        {label}
      </Text>
    </Stack>
  );
}
