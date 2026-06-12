import { useEffect, useState } from 'react';
import { Box, Flex, Heading, HStack } from '@chakra-ui/react';
import type { VisibilityState } from '@tanstack/react-table';
import { LuSearch } from 'react-icons/lu';
import { useSearches } from './api/client';
import { SearchActionPanel } from './components/SearchActionPanel';
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
          <SettingsDrawer
            columnVisibility={columnVisibility}
            onColumnVisibilityChange={setColumnVisibility}
            descriptionExpandEnabled={descriptionExpandEnabled}
            onDescriptionExpandEnabledChange={setDescriptionExpandEnabled}
          />
        </HStack>
      </Box>
      {selectedSearch && (
        <Box borderBottomWidth="1px" borderColor="border.subtle">
          <SearchActionPanel search={selectedSearch} />
        </Box>
      )}
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
