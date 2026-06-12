import { useEffect, useState } from 'react';
import { Flex } from '@chakra-ui/react';
import type { VisibilityState } from '@tanstack/react-table';
import { useSearches } from './api/client';
import { Header } from './components/Header';
import { Toaster } from './components/ui/toaster';
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
      <Header
        searchesVisible={searchesVisible}
        onSearchesVisibleChange={setSearchesVisible}
        selectedSearch={selectedSearch}
        autoRefreshEnabled={autoRefreshEnabled}
        onAutoRefreshEnabledChange={setAutoRefreshEnabled}
        autoRefreshIntervalMin={autoRefreshIntervalMin}
        onAutoRefreshIntervalMinChange={setAutoRefreshIntervalMin}
        columnVisibility={columnVisibility}
        onColumnVisibilityChange={setColumnVisibility}
        descriptionExpandEnabled={descriptionExpandEnabled}
        onDescriptionExpandEnabledChange={setDescriptionExpandEnabled}
      />
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

