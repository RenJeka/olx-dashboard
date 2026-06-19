import { useEffect, useMemo, useState } from 'react';
import { Flex } from '@chakra-ui/react';
import type { RowSelectionState, VisibilityState } from '@tanstack/react-table';
import { useSearches } from './api';
import { Header } from './components/Header';
import { Toaster } from './components/ui/toaster';
import { useAutoRefresh } from './hooks/useAutoRefresh';
import { Searches } from './components/searches';
import { ListingsTable } from './pages/ListingsTable';
import {
  loadColumnVisibility,
  saveColumnVisibility,
  loadColumnOrder,
  saveColumnOrder,
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
  const [columnOrder, setColumnOrder] = useState<string[]>(() => loadColumnOrder());
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
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});
  const { data: searches } = useSearches();
  const selectedSearch = searches?.find((s) => s.id === selectedId);

  // Скидаємо виділення рядків при зміні пошуку (раніше — у ListingsTable).
  useEffect(() => {
    setRowSelection({});
  }, [selectedId]);

  // Id виділених рядків — для майстра AI-аналізу (режим «вибрані»). getRowId = String(id).
  const selectedIds = useMemo(
    () =>
      Object.entries(rowSelection)
        .filter(([, v]) => v)
        .map(([k]) => Number(k)),
    [rowSelection],
  );

  useAutoRefresh(autoRefreshEnabled, autoRefreshIntervalMin);

  useEffect(() => {
    saveColumnVisibility(columnVisibility);
  }, [columnVisibility]);

  useEffect(() => {
    saveColumnOrder(columnOrder);
  }, [columnOrder]);

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
        selectedIds={selectedIds}
        autoRefreshEnabled={autoRefreshEnabled}
        onAutoRefreshEnabledChange={setAutoRefreshEnabled}
        autoRefreshIntervalMin={autoRefreshIntervalMin}
        onAutoRefreshIntervalMinChange={setAutoRefreshIntervalMin}
        columnVisibility={columnVisibility}
        onColumnVisibilityChange={setColumnVisibility}
        columnOrder={columnOrder}
        onColumnOrderChange={setColumnOrder}
        descriptionExpandEnabled={descriptionExpandEnabled}
        onDescriptionExpandEnabledChange={setDescriptionExpandEnabled}
      />
      <Flex flex="1" overflow="hidden">
        <Searches
          selectedId={selectedId}
          onSelect={setSelectedId}
          visible={searchesVisible}
          onVisibleChange={setSearchesVisible}
        />
        <ListingsTable
          searchId={selectedId}
          columnVisibility={columnVisibility}
          onColumnVisibilityChange={setColumnVisibility}
          columnOrder={columnOrder}
          onColumnOrderChange={setColumnOrder}
          descriptionExpandEnabled={descriptionExpandEnabled}
          rowSelection={rowSelection}
          onRowSelectionChange={setRowSelection}
        />
      </Flex>
      <Toaster />
    </Flex>
  );
}

