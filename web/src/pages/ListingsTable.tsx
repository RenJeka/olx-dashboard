import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Row } from '@tanstack/react-table';
import {
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
  type RowSelectionState,
} from '@tanstack/react-table';
import { Box, Flex, Spinner, Table, Text } from '@chakra-ui/react';
import { useListings } from '../api';
import { useListingsTableState } from '../hooks/useListingsTableState';
import { useListingsUiStore } from '../stores/listingsUiStore';
import { useSettingsStore } from '../stores/settingsStore';
import { columns } from '../components/table/columns';
import { ListingsTableHeader } from '../components/table/ListingsTableHeader';
import { ListingsTableBody } from '../components/table/ListingsTableBody';
import { ListingsFilterBar } from '../components/table/topbar';
import { TablePagination } from '../components/table/TablePagination';
import { DescriptionDialog } from '../components/DescriptionDialog';
import { stripDescriptionHtml } from '../utils/format';
import { matchesQuery } from '../utils/search';
import { isListingVisible } from '../utils/listingVisibility';
import type { SearchScope } from '../components/table/topbar';
import type { Listing } from '../types';

export { TOGGLEABLE_COLUMNS } from '../components/table/columns';

export function ListingsTable() {
  const searchId = useSettingsStore((s) => s.selectedSearchId);
  const columnVisibility = useSettingsStore((s) => s.columnVisibility);
  const setColumnVisibility = useSettingsStore((s) => s.setColumnVisibility);
  const columnOrder = useSettingsStore((s) => s.columnOrder);
  const descriptionExpandEnabled = useSettingsStore((s) => s.descriptionExpandEnabled);
  const rowSelection = useSettingsStore((s) => s.rowSelection);
  const setRowSelection = useSettingsStore((s) => s.setRowSelection);
  const { data, isLoading } = useListings(searchId);
  const { sorting, setSorting, columnSizing, setColumnSizing, pagination, setPagination } =
    useListingsTableState();
  const [descriptionListing, setDescriptionListing] = useState<Listing | null>(null);
  const statusFilter = useListingsUiStore((s) => s.statusFilter);
  const showFilteredOut = useListingsUiStore((s) => s.showFilteredOut);
  const showIrrelevant = useListingsUiStore((s) => s.showIrrelevant);
  const [searchText, setSearchText] = useState('');
  const [searchScope, setSearchScope] = useState<SearchScope>({ inTitle: true, inDescription: true });

  // Стабільне посилання (залежить лише від searchScope), щоб не інвалідувати
  // внутрішні мемо TanStack на кожен рендер.
  const globalFilterFn = useCallback(
    (row: Row<Listing>, _columnId: string, filterValue: unknown) => {
      const query = String(filterValue).trim();
      if (!query) return true;
      // Поле(я) для пошуку зливаємо в один haystack — терми (&&/||/!) працюють крізь
      // назву й опис разом.
      const parts: string[] = [];
      if (searchScope.inTitle) parts.push((row.original.title ?? '').toLowerCase());
      if (searchScope.inDescription) parts.push(stripDescriptionHtml(row.original.description).toLowerCase());
      if (parts.length === 0) return false;
      return matchesQuery(parts.join('\n'), query);
    },
    [searchScope],
  );

  const rows = useMemo(() => data ?? [], [data]);

  // Авто-показ/приховання колонки ai_rank та скидання сортування при переключенні табу.
  useEffect(() => {
    const isAiPicks = statusFilter === 'ai_picks';
    setColumnVisibility((prev) => ({ ...prev, ai_rank: isAiPicks }));
    if (isAiPicks) {
      setSorting([{ id: 'price', desc: false }]);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter]);

  const visibleRows = useMemo(
    () => rows.filter((l) => isListingVisible(l, statusFilter, showFilteredOut, showIrrelevant)),
    [rows, showFilteredOut, showIrrelevant, statusFilter],
  );

  const table = useReactTable({
    data: visibleRows,
    columns,
    state: {
      sorting,
      columnSizing,
      columnVisibility,
      // 'select' завжди першою; решта — збережений порядок (порожній = дефолт TanStack)
      columnOrder: columnOrder.length > 0 ? ['select', ...columnOrder] : [],
      pagination,
      globalFilter: searchText,
      rowSelection,
    },
    getRowId: (row) => String(row.id),
    // Не скидати сторінку/сортування при зміні data (інлайн-едіт нотатки/плюсів/
    // мінусів/статусу оновлює масив через .map) — інакше TanStack автоматично
    // повертає на 1-шу сторінку й користувач втрачає позицію.
    autoResetPageIndex: false,
    enableRowSelection: true,
    onRowSelectionChange: setRowSelection,
    onSortingChange: setSorting,
    onColumnSizingChange: setColumnSizing,
    onColumnVisibilityChange: setColumnVisibility,
    onPaginationChange: setPagination,
    onGlobalFilterChange: setSearchText,
    globalFilterFn,
    columnResizeMode: 'onEnd',
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
  });

  if (searchId == null) {
    return (
      <Text p={8} color="fg.muted">
        Обери пошук зліва, щоб побачити оголошення.
      </Text>
    );
  }

  if (isLoading) {
    return (
      <Box p={8}>
        <Spinner color="blue.500" />
      </Box>
    );
  }

  if (rows.length === 0) {
    return (
      <Text p={8} color="fg.muted">
        Оголошень немає. Натисни «Scan» для цього пошуку.
      </Text>
    );
  }

  const selectedIds = table.getSelectedRowModel().rows.map((row) => row.original.id);
  // «Вибрати всі у вкладці»: всі рядки поточного табу + пошуку (всі сторінки), не лише видима сторінка.
  const filteredRows = table.getFilteredRowModel().rows;
  const allTabSelected = filteredRows.length > 0 && filteredRows.every((r) => r.getIsSelected());
  const toggleSelectAllInTab = () => {
    if (allTabSelected) {
      setRowSelection({});
      return;
    }
    const next: RowSelectionState = {};
    for (const r of filteredRows) next[r.id] = true;
    setRowSelection(next);
  };
  // Підпис видимих колонок (порядок + видимість) — інвалідує memo-рядки при reorder/toggle.
  const columnLayoutKey = table.getVisibleLeafColumns().map((c) => c.id).join(',');

  return (
    <Flex direction="column" flex="1" overflow="hidden">
      <ListingsFilterBar
        listings={rows}
        searchText={searchText}
        onSearchTextChange={setSearchText}
        searchScope={searchScope}
        onSearchScopeChange={setSearchScope}
        searchId={searchId ?? undefined}
        selectedIds={selectedIds}
        onClearSelection={() => setRowSelection({})}
        tabSelectableCount={filteredRows.length}
        allTabSelected={allTabSelected}
        onToggleSelectAllInTab={toggleSelectAllInTab}
      />
      <Box flex="1" overflow="auto" px={4} pb={4}>
        <Table.Root size="sm" interactive css={{ tableLayout: 'fixed', width: table.getTotalSize() }}>
          <ListingsTableHeader table={table} />
          <ListingsTableBody
            table={table}
            descriptionExpandEnabled={descriptionExpandEnabled}
            onOpenDescription={setDescriptionListing}
            searchQuery={searchText}
            columnLayoutKey={columnLayoutKey}
          />
        </Table.Root>
        {table.getRowModel().rows.length === 0 && (
          <Text p={4} color="fg.muted">
            Немає оголошень за обраними фільтрами.
          </Text>
        )}
      </Box>
      <TablePagination table={table} />
      <DescriptionDialog listing={descriptionListing} onClose={() => setDescriptionListing(null)} />
    </Flex>
  );
}
