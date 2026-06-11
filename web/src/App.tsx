import { useEffect, useState } from 'react';
import { Box, Flex, Heading, HStack, Text } from '@chakra-ui/react';
import type { VisibilityState } from '@tanstack/react-table';
import { LuSearch } from 'react-icons/lu';
import { useSearches, useListings } from './api/client';
import { SettingsDrawer } from './components/SettingsDrawer';
import { Toaster } from './components/ui/toaster';
import { Searches } from './pages/Searches';
import { ListingsTable } from './pages/ListingsTable';
import {
  loadColumnVisibility,
  saveColumnVisibility,
  loadDescriptionExpandEnabled,
  saveDescriptionExpandEnabled,
} from './utils/storage';

export function App() {
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>(() =>
    loadColumnVisibility(),
  );
  const [descriptionExpandEnabled, setDescriptionExpandEnabled] = useState<boolean>(() =>
    loadDescriptionExpandEnabled(),
  );
  const { data: searches } = useSearches();
  const { data: listings } = useListings(selectedId);
  const selectedSearch = searches?.find((s) => s.id === selectedId);

  useEffect(() => {
    saveColumnVisibility(columnVisibility);
  }, [columnVisibility]);

  useEffect(() => {
    saveDescriptionExpandEnabled(descriptionExpandEnabled);
  }, [descriptionExpandEnabled]);

  return (
    <Flex direction="column" h="100vh">
      <Box as="header" borderBottomWidth="1px" borderColor="border.subtle" px={4} py={3}>
        <HStack justify="space-between">
          <HStack gap={2}>
            <LuSearch />
            <Heading size="lg">OLX Monitor</Heading>
          </HStack>
          <HStack gap={4}>
            {selectedSearch && (
              <Text color="fg.muted" fontSize="sm">
                {selectedSearch.visible_total_count != null
                  ? `Результатів на OLX: ${selectedSearch.visible_total_count.toLocaleString('uk-UA')} · У базі: ${(listings?.length ?? 0).toLocaleString('uk-UA')}`
                  : `У базі: ${(listings?.length ?? 0).toLocaleString('uk-UA')}`}
              </Text>
            )}
            <SettingsDrawer
              columnVisibility={columnVisibility}
              onColumnVisibilityChange={setColumnVisibility}
              descriptionExpandEnabled={descriptionExpandEnabled}
              onDescriptionExpandEnabledChange={setDescriptionExpandEnabled}
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
          descriptionExpandEnabled={descriptionExpandEnabled}
        />
      </Flex>
      <Toaster />
    </Flex>
  );
}
