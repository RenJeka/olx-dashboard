import { useMemo, useState } from 'react';
import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
  type SortingState,
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

function formatPrice(l: Listing): string {
  if (l.price == null) return '—';
  return `${l.price.toLocaleString('uk-UA')} ${l.currency}`;
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
    cell: (info) => formatPrice(info.row.original),
  }),
  columnHelper.accessor('city', {
    header: () => <HeaderLabel icon={<LuMapPin />}>Місто</HeaderLabel>,
    cell: (info) => info.getValue() ?? '—',
  }),
  columnHelper.accessor('posted_at', {
    header: () => <HeaderLabel icon={<LuCalendar />}>Дата</HeaderLabel>,
    cell: (info) => info.getValue() ?? '—',
  }),
];

interface Props {
  searchId: number | null;
}

export function ListingsTable({ searchId }: Props) {
  const { data, isLoading } = useListings(searchId);
  const [sorting, setSorting] = useState<SortingState>([]);

  const rows = useMemo(() => data ?? [], [data]);

  const table = useReactTable({
    data: rows,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
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
      <Table.Root size="sm" interactive>
        <Table.Header>
          {table.getHeaderGroups().map((hg) => (
            <Table.Row key={hg.id}>
              {hg.headers.map((header) => (
                <Table.ColumnHeader
                  key={header.id}
                  onClick={header.column.getToggleSortingHandler()}
                  cursor={header.column.getCanSort() ? 'pointer' : undefined}
                  userSelect="none"
                >
                  {flexRender(header.column.columnDef.header, header.getContext())}
                  {{ asc: ' ↑', desc: ' ↓' }[header.column.getIsSorted() as string] ?? ''}
                </Table.ColumnHeader>
              ))}
            </Table.Row>
          ))}
        </Table.Header>
        <Table.Body>
          {table.getRowModel().rows.map((row) => (
            <Table.Row key={row.id}>
              {row.getVisibleCells().map((cell) => (
                <Table.Cell key={cell.id} verticalAlign="middle">
                  {flexRender(cell.column.columnDef.cell, cell.getContext())}
                </Table.Cell>
              ))}
            </Table.Row>
          ))}
        </Table.Body>
      </Table.Root>
    </Box>
  );
}
