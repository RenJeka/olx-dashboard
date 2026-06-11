import { useMemo } from 'react';
import {
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
  type OnChangeFn,
  type VisibilityState,
} from '@tanstack/react-table';
import { Box, Spinner, Table, Text } from '@chakra-ui/react';
import { useListings } from '../api/client';
import { useListingsTableState } from '../hooks/useListingsTableState';
import { columns } from '../components/table/columns';
import { ListingsTableHeader } from '../components/table/ListingsTableHeader';
import { ListingsTableBody } from '../components/table/ListingsTableBody';

export { TOGGLEABLE_COLUMNS } from '../components/table/columns';

interface Props {
  searchId: number | null;
  columnVisibility: VisibilityState;
  onColumnVisibilityChange: OnChangeFn<VisibilityState>;
}

export function ListingsTable({ searchId, columnVisibility, onColumnVisibilityChange }: Props) {
  const { data, isLoading } = useListings(searchId);
  const { sorting, setSorting, columnSizing, setColumnSizing } = useListingsTableState();

  const rows = useMemo(() => data ?? [], [data]);

  const table = useReactTable({
    data: rows,
    columns,
    state: { sorting, columnSizing, columnVisibility },
    onSortingChange: setSorting,
    onColumnSizingChange: setColumnSizing,
    onColumnVisibilityChange: onColumnVisibilityChange,
    columnResizeMode: 'onChange',
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
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

  return (
    <Box flex="1" overflow="auto" p={4}>
      <Table.Root size="sm" interactive css={{ tableLayout: 'fixed', width: table.getTotalSize() }}>
        <ListingsTableHeader table={table} />
        <ListingsTableBody table={table} />
      </Table.Root>
    </Box>
  );
}
