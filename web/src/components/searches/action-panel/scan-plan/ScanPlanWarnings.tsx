import { Box, HStack, Stack, Text } from '@chakra-ui/react';
import { LuTriangleAlert } from 'react-icons/lu';
import { InfoTooltip } from './InfoTooltip';
import { COVERAGE_WARNING_PREFIX } from './scanPlanText';

/** Попередження аналізу; маркер «вікно покриття» — скорочено, з поясненням у тултіпі. */
export function ScanPlanWarnings({ warnings }: { warnings: string[] }) {
  if (warnings.length === 0) return null;
  return (
    <Stack gap={1.5} p={3} rounded="lg" bg="warning.subtle/40" borderWidth="1px" borderColor="warning.muted">
      {warnings.map((w, idx) => {
        const isCoverage = w.startsWith(COVERAGE_WARNING_PREFIX);
        return (
          <HStack key={idx} gap={1.5} align="start">
            <Box as={LuTriangleAlert} color="warning.fg" fontSize="xs" mt="2px" flexShrink={0} />
            <Text fontSize="xs" color="warning.fg" lineHeight="1.4">
              {isCoverage ? 'Вікно покриття пропущено.' : w}
            </Text>
            {isCoverage && (
              <InfoTooltip content="Декілька варіантів запиту (синоніми) дають об'єднану видачу, не відсортовану глобально за датою підняття, тож авто-вимкнення зниклих оголошень за цим сканом не спрацює. Живість таких оголошень перевіряє ручний прохід «Перевірити неактивні»." />
            )}
          </HStack>
        );
      })}
    </Stack>
  );
}
