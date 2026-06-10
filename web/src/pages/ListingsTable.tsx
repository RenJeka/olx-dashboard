import { useEffect, useMemo, useState } from 'react';
import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnSizingState,
  type OnChangeFn,
  type SortingState,
  type VisibilityState,
} from '@tanstack/react-table';
import { Box, HStack, Image, Link, Spinner, Table, Text } from '@chakra-ui/react';
import {
  LuCalendar,
  LuExternalLink,
  LuImage,
  LuMapPin,
  LuTag,
} from 'react-icons/lu';
import { useListings, type Listing } from '../api/client';

const columnHelper = createColumnHelper<Listing>();

const STORAGE_KEY = 'olx-listings-table-v1';

interface StoredTableState {
  columnSizing: ColumnSizingState;
  sorting: SortingState;
}

function loadTableState(): StoredTableState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { columnSizing: {}, sorting: [] };
    const parsed = JSON.parse(raw) as Partial<StoredTableState>;
    return {
      columnSizing: parsed.columnSizing ?? {},
      sorting: parsed.sorting ?? [],
    };
  } catch {
    return { columnSizing: {}, sorting: [] };
  }
}

function formatPrice(l: Listing): string {
  if (l.price == null) return '—';
  return `${l.price.toLocaleString('uk-UA')} ${l.currency}`;
}

function formatDate(value: string | null): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('uk-UA', { dateStyle: 'short', timeStyle: 'short' });
}

function HeaderLabel({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <HStack gap={1}>
      {icon}
      <Text>{children}</Text>
    </HStack>
  );
}

const columns = [
  columnHelper.accessor('photo_url', {
    header: () => <HeaderLabel icon={<LuImage />}>Фото</HeaderLabel>,
    enableSorting: false,
    size: 72,
    minSize: 56,
    maxSize: 200,
    cell: (info) => {
      const src = info.getValue();
      return src ? (
        <Image src={src} alt="" boxSize={12} rounded="md" objectFit="cover" loading="lazy" />
      ) : (
        <Box boxSize={12} rounded="md" bg="bg.muted" />
      );
    },
  }),
  columnHelper.accessor('title', {
    header: 'Назва',
    size: 480,
    minSize: 180,
    cell: (info) => {
      const url = info.row.original.url;
      const title = info.getValue() ?? '—';
      return url ? (
        <Link href={url} target="_blank" rel="noreferrer" colorPalette="blue" color="colorPalette.fg">
          <HStack gap={1}>
            <Text>{title}</Text>
            <LuExternalLink />
          </HStack>
        </Link>
      ) : (
        title
      );
    },
  }),
  columnHelper.accessor('price', {
    header: () => <HeaderLabel icon={<LuTag />}>Ціна</HeaderLabel>,
    size: 120,
    minSize: 80,
    maxSize: 240,
    cell: (info) => formatPrice(info.row.original),
  }),
  columnHelper.accessor('city', {
    header: () => <HeaderLabel icon={<LuMapPin />}>Місто</HeaderLabel>,
    size: 130,
    minSize: 80,
    maxSize: 280,
    cell: (info) => info.getValue() ?? '—',
  }),
  columnHelper.accessor('posted_at', {
    header: () => <HeaderLabel icon={<LuCalendar />}>Дата</HeaderLabel>,
    size: 150,
    minSize: 100,
    maxSize: 260,
    cell: (info) => formatDate(info.getValue()),
  }),
];

export const TOGGLEABLE_COLUMNS: { id: string; label: string }[] = [
  { id: 'photo_url', label: 'Фото' },
  { id: 'title', label: 'Назва' },
  { id: 'price', label: 'Ціна' },
  { id: 'city', label: 'Місто' },
  { id: 'posted_at', label: 'Дата' },
];

interface Props {
  searchId: number | null;
  columnVisibility: VisibilityState;
  onColumnVisibilityChange: OnChangeFn<VisibilityState>;
}

export function ListingsTable({ searchId, columnVisibility, onColumnVisibilityChange }: Props) {
  const { data, isLoading } = useListings(searchId);
  const [sorting, setSorting] = useState<SortingState>(() => loadTableState().sorting);
  const [columnSizing, setColumnSizing] = useState<ColumnSizingState>(
    () => loadTableState().columnSizing,
  );

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

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ columnSizing, sorting }));
  }, [columnSizing, sorting]);

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
        <Table.Header>
          {table.getHeaderGroups().map((hg) => (
            <Table.Row key={hg.id}>
              {hg.headers.map((header) => (
                <Table.ColumnHeader
                  key={header.id}
                  position="relative"
                  style={{ width: header.getSize() }}
                  onClick={header.column.getToggleSortingHandler()}
                  cursor={header.column.getCanSort() ? 'pointer' : undefined}
                  userSelect="none"
                  whiteSpace="nowrap"
                  overflow="hidden"
                  textOverflow="ellipsis"
                >
                  <HStack gap={1}>
                    {flexRender(header.column.columnDef.header, header.getContext())}
                    {{ asc: '↑', desc: '↓' }[header.column.getIsSorted() as string] && (
                      <Text as="span">
                        {{ asc: '↑', desc: '↓' }[header.column.getIsSorted() as string]}
                      </Text>
                    )}
                  </HStack>
                  <Box
                    onMouseDown={header.getResizeHandler()}
                    onTouchStart={header.getResizeHandler()}
                    onClick={(e) => e.stopPropagation()}
                    position="absolute"
                    top={0}
                    right={0}
                    h="full"
                    w="4px"
                    cursor="col-resize"
                    userSelect="none"
                    style={{ touchAction: 'none' }}
                    bg={header.column.getIsResizing() ? 'blue.500' : 'transparent'}
                    _hover={{ bg: 'blue.400' }}
                  />
                </Table.ColumnHeader>
              ))}
            </Table.Row>
          ))}
        </Table.Header>
        <Table.Body>
          {table.getRowModel().rows.map((row) => (
            <Table.Row key={row.id}>
              {row.getVisibleCells().map((cell) => {
                const isTitle = cell.column.id === 'title';
                return (
                  <Table.Cell
                    key={cell.id}
                    verticalAlign="middle"
                    style={{ width: cell.column.getSize() }}
                    whiteSpace={isTitle ? 'normal' : 'nowrap'}
                    overflow={isTitle ? undefined : 'hidden'}
                    textOverflow={isTitle ? undefined : 'ellipsis'}
                  >
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </Table.Cell>
                );
              })}
            </Table.Row>
          ))}
        </Table.Body>
      </Table.Root>
    </Box>
  );
}
