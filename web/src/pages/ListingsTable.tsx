import { useEffect, useMemo, useState } from 'react';
import {
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
  type OnChangeFn,
  type RowSelectionState,
  type VisibilityState,
} from '@tanstack/react-table';
import { Box, Flex, Spinner, Table, Text } from '@chakra-ui/react';
import { useListings } from '../api/client';
import { useListingsTableState } from '../hooks/useListingsTableState';
import { columns } from '../components/table/columns';
import { ListingsTableHeader } from '../components/table/ListingsTableHeader';
import { ListingsTableBody } from '../components/table/ListingsTableBody';
import { ListingsFilterBar } from '../components/table/ListingsFilterBar';

import { TablePagination } from '../components/table/TablePagination';
import { DescriptionDialog } from '../components/DescriptionDialog';
import { stripDescriptionHtml } from '../utils/format';
import type { Listing, ListingStatus } from '../types';

export { TOGGLEABLE_COLUMNS } from '../components/table/columns';

interface Props {
  searchId: number | null;
  columnVisibility: VisibilityState;
  onColumnVisibilityChange: OnChangeFn<VisibilityState>;
  columnOrder: string[];
  onColumnOrderChange: (order: string[]) => void;
  descriptionExpandEnabled: boolean;
}

export function ListingsTable({
  searchId,
  columnVisibility,
  onColumnVisibilityChange,
  columnOrder,
  descriptionExpandEnabled,
}: Props) {
  const { data, isLoading } = useListings(searchId);
  const { sorting, setSorting, columnSizing, setColumnSizing, pagination, setPagination } =
    useListingsTableState();
  const [descriptionListing, setDescriptionListing] = useState<Listing | null>(null);
  const [statusFilter, setStatusFilter] = useState<ListingStatus | 'all'>('all');
  const [showFilteredOut, setShowFilteredOut] = useState(false);
  const [globalFilter, setGlobalFilter] = useState('');
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});

  useEffect(() => {
    setRowSelection({});
  }, [searchId]);

  const rows = useMemo(() => data ?? [], [data]);

  const visibleRows = useMemo(
    () =>
      rows.filter(
        (l) =>
          (showFilteredOut || l.filtered_out === 0) &&
          (statusFilter === 'all' || l.status === statusFilter),
      ),
    [rows, showFilteredOut, statusFilter],
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
      globalFilter,
      rowSelection,
    },
    getRowId: (row) => String(row.id),
    enableRowSelection: true,
    onRowSelectionChange: setRowSelection,
    onSortingChange: setSorting,
    onColumnSizingChange: setColumnSizing,
    onColumnVisibilityChange: onColumnVisibilityChange,
    onPaginationChange: setPagination,
    onGlobalFilterChange: setGlobalFilter,
    globalFilterFn: (row, _columnId, filterValue) => {
      const query = String(filterValue).trim().toLowerCase();
      if (!query) return true;
      const title = (row.original.title ?? '').toLowerCase();
      const description = stripDescriptionHtml(row.original.description).toLowerCase();
      return title.includes(query) || description.includes(query);
    },
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

  return (
    <Flex direction="column" flex="1" overflow="hidden">
      <ListingsFilterBar
        listings={rows}
        statusFilter={statusFilter}
        onStatusFilterChange={setStatusFilter}
        showFilteredOut={showFilteredOut}
        onShowFilteredOutChange={setShowFilteredOut}
        searchText={globalFilter}
        onSearchTextChange={setGlobalFilter}
        searchId={searchId ?? undefined}
        selectedIds={selectedIds}
        onClearSelection={() => setRowSelection({})}
      />
      <Box flex="1" overflow="auto" px={4} pb={4}>
        <Table.Root size="sm" interactive css={{ tableLayout: 'fixed', width: table.getTotalSize() }}>
          <ListingsTableHeader table={table} />
          <ListingsTableBody
            table={table}
            descriptionExpandEnabled={descriptionExpandEnabled}
            onOpenDescription={setDescriptionListing}
            searchQuery={globalFilter}
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
