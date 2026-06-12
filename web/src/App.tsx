import { useEffect, useState } from 'react';
import { Badge, Box, Flex, Heading, HStack, IconButton } from '@chakra-ui/react';
import type { VisibilityState } from '@tanstack/react-table';
import { LuChevronLeft, LuMenu, LuSearch, LuTimer } from 'react-icons/lu';
import { useSearches } from './api/client';
import { SearchActionPanel } from './components/SearchActionPanel';
import { SettingsDrawer } from './components/SettingsDrawer';
import { Toaster } from './components/ui/toaster';
import { Tooltip } from './components/ui/tooltip';
import { useAutoRefresh } from './hooks/useAutoRefresh';
import { Searches } from './components/Searches';
import { ListingsTable } from './pages/ListingsTable';
import {
  loadColumnVisibility,
  saveColumnVisibility,
  loadDescriptionExpandEnabled,
  saveDescriptionExpandEnabled,
  loadAutoRefreshEnabled,
  saveAutoRefreshEnabled,
  loadAutoRefreshIntervalMin,
  saveAutoRefreshIntervalMin,
  loadSearchesVisible,
  saveSearchesVisible,
} from './utils/storage';

export function App() {
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>(() =>
    loadColumnVisibility(),
  );
  const [descriptionExpandEnabled, setDescriptionExpandEnabled] = useState<boolean>(() =>
    loadDescriptionExpandEnabled(),
  );
  const [autoRefreshEnabled, setAutoRefreshEnabled] = useState<boolean>(() =>
    loadAutoRefreshEnabled(),
  );
  const [autoRefreshIntervalMin, setAutoRefreshIntervalMin] = useState<number>(() =>
    loadAutoRefreshIntervalMin(),
  );
  const [searchesVisible, setSearchesVisible] = useState<boolean>(() =>
    loadSearchesVisible(),
  );
  const { data: searches } = useSearches();
  const selectedSearch = searches?.find((s) => s.id === selectedId);

  useAutoRefresh(autoRefreshEnabled, autoRefreshIntervalMin);

  useEffect(() => {
    saveColumnVisibility(columnVisibility);
  }, [columnVisibility]);

  useEffect(() => {
    saveDescriptionExpandEnabled(descriptionExpandEnabled);
  }, [descriptionExpandEnabled]);

  useEffect(() => {
    saveAutoRefreshEnabled(autoRefreshEnabled);
  }, [autoRefreshEnabled]);

  useEffect(() => {
    saveAutoRefreshIntervalMin(autoRefreshIntervalMin);
  }, [autoRefreshIntervalMin]);

  useEffect(() => {
    saveSearchesVisible(searchesVisible);
  }, [searchesVisible]);

  return (
    <Flex direction="column" h="100vh">
      <Box as="header" borderBottomWidth="1px" borderColor="border.subtle" px={4} py={3}>
        <HStack justify="space-between">
          <HStack gap={2}>
            <Tooltip content={searchesVisible ? "Сховати бічну панель" : "Показати бічну панель"}>
              <IconButton
                aria-label="Toggle Sidebar"
                variant="ghost"
                size="sm"
                onClick={() => setSearchesVisible(!searchesVisible)}
              >
                {searchesVisible ? <LuChevronLeft /> : <LuMenu />}
              </IconButton>
            </Tooltip>
            <LuSearch />
            <Heading size="lg">OLX Monitor</Heading>
          </HStack>
          <HStack gap={2}>
            {autoRefreshEnabled && (
              <Badge colorPalette="blue" variant="subtle">
                <LuTimer /> авто: {autoRefreshIntervalMin} хв
              </Badge>
            )}
            {selectedSearch && (
              <SearchActionPanel search={selectedSearch} />
            )}
            <SettingsDrawer
              columnVisibility={columnVisibility}
              onColumnVisibilityChange={setColumnVisibility}
              descriptionExpandEnabled={descriptionExpandEnabled}
              onDescriptionExpandEnabledChange={setDescriptionExpandEnabled}
              autoRefreshEnabled={autoRefreshEnabled}
              onAutoRefreshEnabledChange={setAutoRefreshEnabled}
              autoRefreshIntervalMin={autoRefreshIntervalMin}
              onAutoRefreshIntervalMinChange={setAutoRefreshIntervalMin}
            />
          </HStack>
        </HStack>
      </Box>
      <Flex flex="1" overflow="hidden">
        <Searches
          selectedId={selectedId}
          onSelect={setSelectedId}
          visible={searchesVisible}
        />
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
