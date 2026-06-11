import { useEffect, useState } from 'react';
import { Box, Flex, Heading, HStack, Text } from '@chakra-ui/react';
import type { VisibilityState } from '@tanstack/react-table';
import { LuSearch } from 'react-icons/lu';
import { useSearches } from './api/client';
import { SettingsDrawer } from './components/SettingsDrawer';
import { Toaster } from './components/ui/toaster';
import { Searches } from './pages/Searches';
import { ListingsTable } from './pages/ListingsTable';
import { loadColumnVisibility, saveColumnVisibility } from './utils/storage';

export function App() {
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>(() =>
    loadColumnVisibility(),
  );
  const { data: searches } = useSearches();
  const selectedSearch = searches?.find((s) => s.id === selectedId);

  useEffect(() => {
    saveColumnVisibility(columnVisibility);
  }, [columnVisibility]);

  return (
    <Flex direction="column" h="100vh">
      <Box as="header" borderBottomWidth="1px" borderColor="border.subtle" px={4} py={3}>
        <HStack justify="space-between">
          <HStack gap={2}>
            <LuSearch />
            <Heading size="lg">OLX Monitor</Heading>
          </HStack>
          <HStack gap={4}>
            {selectedSearch?.visible_total_count != null && (
              <Text color="fg.muted" fontSize="sm">
                Результатів: {selectedSearch.visible_total_count.toLocaleString('uk-UA')}
              </Text>
            )}
            <SettingsDrawer
              columnVisibility={columnVisibility}
              onColumnVisibilityChange={setColumnVisibility}
            />
          </HStack>
        </HStack>
      </Box>
      <Flex flex="1" overflow="hidden">
        <Searches selectedId={selectedId} onSelect={setSelectedId} />
        <ListingsTable
          searchId={selectedId}
          columnVisibility={columnVisibility}
          onColumnVisibilityChange={setColumnVisibility}
        />
      </Flex>
      <Toaster />
    </Flex>
  );
}
