import { Box, SimpleGrid, Text } from '@chakra-ui/react';
import type { SearchStats } from '../../../types';

interface Props {
  visibleTotal?: number | null;
  stats?: SearchStats;
}

/** Блок статистики пошуку (кількість на OLX, у базі, зниклі). */
export function ActionPanelStats({ visibleTotal, stats }: Props) {
  return (
    <SimpleGrid columns={{ base: 2, md: 3 }} gap={3}>
      <Box p={3} bg="bg.muted" rounded="lg" borderWidth="1px" borderColor="border.subtle" textAlign="center">
        <Text textStyle="xs" color="fg.muted" fontWeight="semibold">На OLX</Text>
        <Text textStyle="xl" fontWeight="bold" mt={1}>
          {visibleTotal != null ? visibleTotal.toLocaleString('uk-UA') : '—'}
        </Text>
      </Box>
      <Box p={3} bg="bg.muted" rounded="lg" borderWidth="1px" borderColor="border.subtle" textAlign="center">
        <Text textStyle="xs" color="fg.muted" fontWeight="semibold">У базі</Text>
        <Text textStyle="xl" fontWeight="bold" mt={1} color="accent.fg">
          {(stats?.in_db ?? 0).toLocaleString('uk-UA')}
        </Text>
      </Box>
      <Box p={3} bg="bg.muted" rounded="lg" borderWidth="1px" borderColor="border.subtle" textAlign="center">
        <Text textStyle="xs" color="fg.muted" fontWeight="semibold">Зниклі/Старі</Text>
        <Text textStyle="xl" fontWeight="bold" mt={1} color="warning.fg">
          {(stats?.stale_count ?? 0).toLocaleString('uk-UA')}
        </Text>
      </Box>
    </SimpleGrid>
  );
}
