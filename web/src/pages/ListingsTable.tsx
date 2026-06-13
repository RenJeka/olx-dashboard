import { useCallback, useMemo, useState } from 'react';
import type { Row } from '@tanstack/react-table';
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
import { ListingsFilterBar } from '../components/table/topbar';
import { TablePagination } from '../components/table/TablePagination';
import { DescriptionDialog } from '../components/DescriptionDialog';
import { stripDescriptionHtml } from '../utils/format';
import type { SearchScope } from '../components/table/topbar';
import type { Listing, ListingStatus } from '../types';

export { TOGGLEABLE_COLUMNS } from '../components/table/columns';

interface Props {
  searchId: number | null;
  columnVisibility: VisibilityState;
  onColumnVisibilityChange: OnChangeFn<VisibilityState>;
  columnOrder: string[];
  onColumnOrderChange: (order: string[]) => void;
  descriptionExpandEnabled: boolean;
  rowSelection: RowSelectionState;
  onRowSelectionChange: OnChangeFn<RowSelectionState>;
}

export function ListingsTable({
  searchId,
  columnVisibility,
  onColumnVisibilityChange,
  columnOrder,
  descriptionExpandEnabled,
  rowSelection,
  onRowSelectionChange,
}: Props) {
  const { data, isLoading } = useListings(searchId);
  const { sorting, setSorting, columnSizing, setColumnSizing, pagination, setPagination } =
    useListingsTableState();
  const [descriptionListing, setDescriptionListing] = useState<Listing | null>(null);
  const [statusFilter, setStatusFilter] = useState<ListingStatus | 'all'>('all');
  const [showFilteredOut, setShowFilteredOut] = useState(false);
  const [searchText, setSearchText] = useState('');
  const [searchScope, setSearchScope] = useState<SearchScope>({ inTitle: true, inDescription: true });

  // Стабільне посилання (залежить лише від searchScope), щоб не інвалідувати
  // внутрішні мемо TanStack на кожен рендер.
  const globalFilterFn = useCallback(
    (row: Row<Listing>, _columnId: string, filterValue: unknown) => {
      const query = String(filterValue).trim().toLowerCase();
      if (!query) return true;
      const titleMatch =
        searchScope.inTitle && (row.original.title ?? '').toLowerCase().includes(query);
      const descMatch =
        searchScope.inDescription &&
        stripDescriptionHtml(row.original.description).toLowerCase().includes(query);
      return titleMatch || descMatch;
    },
    [searchScope],
  );

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
      globalFilter: searchText,
      rowSelection,
    },
    getRowId: (row) => String(row.id),
    enableRowSelection: true,
    onRowSelectionChange: onRowSelectionChange,
    onSortingChange: setSorting,
    onColumnSizingChange: setColumnSizing,
    onColumnVisibilityChange: onColumnVisibilityChange,
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

  return (
    <Flex direction="column" flex="1" overflow="hidden">
      <ListingsFilterBar
        listings={rows}
        statusFilter={statusFilter}
        onStatusFilterChange={setStatusFilter}
        showFilteredOut={showFilteredOut}
        onShowFilteredOutChange={setShowFilteredOut}
        searchText={searchText}
        onSearchTextChange={setSearchText}
        searchScope={searchScope}
        onSearchScopeChange={setSearchScope}
        searchId={searchId ?? undefined}
        selectedIds={selectedIds}
        onClearSelection={() => onRowSelectionChange({})}
      />
      <Box flex="1" overflow="auto" px={4} pb={4}>
        <Table.Root size="sm" interactive css={{ tableLayout: 'fixed', width: table.getTotalSize() }}>
          <ListingsTableHeader table={table} />
          <ListingsTableBody
            table={table}
            descriptionExpandEnabled={descriptionExpandEnabled}
            onOpenDescription={setDescriptionListing}
            searchQuery={searchText}
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
