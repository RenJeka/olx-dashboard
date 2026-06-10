import { useMemo, useState } from 'react';
import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
  type SortingState,
} from '@tanstack/react-table';
import { useListings, type Listing } from '../api/client';

const columnHelper = createColumnHelper<Listing>();

function formatPrice(l: Listing): string {
  if (l.price == null) return '—';
  return `${l.price.toLocaleString('uk-UA')} ${l.currency}`;
}

const columns = [
  columnHelper.accessor('photo_url', {
    header: 'Фото',
    enableSorting: false,
    cell: (info) => {
      const src = info.getValue();
      return src ? (
        <img
          src={src}
          alt=""
          className="h-12 w-12 rounded object-cover"
          loading="lazy"
        />
      ) : (
        <div className="h-12 w-12 rounded bg-gray-100" />
      );
    },
  }),
  columnHelper.accessor('title', {
    header: 'Назва',
    cell: (info) => {
      const url = info.row.original.url;
      const title = info.getValue() ?? '—';
      return url ? (
        <a
          href={url}
          target="_blank"
          rel="noreferrer"
          className="text-blue-600 hover:underline"
        >
          {title}
        </a>
      ) : (
        title
      );
    },
  }),
  columnHelper.accessor('price', {
    header: 'Ціна',
    cell: (info) => formatPrice(info.row.original),
  }),
  columnHelper.accessor('city', {
    header: 'Місто',
    cell: (info) => info.getValue() ?? '—',
  }),
  columnHelper.accessor('posted_at', {
    header: 'Дата',
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
      <div className="p-8 text-gray-500">Обери пошук зліва, щоб побачити оголошення.</div>
    );
  }

  if (isLoading) {
    return <div className="p-8 text-gray-500">Завантаження…</div>;
  }

  if (rows.length === 0) {
    return (
      <div className="p-8 text-gray-500">
        Оголошень немає. Натисни «Scan» для цього пошуку.
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-auto p-4">
      <table className="w-full border-collapse text-sm">
        <thead>
          {table.getHeaderGroups().map((hg) => (
            <tr key={hg.id} className="border-b border-gray-200 text-left">
              {hg.headers.map((header) => (
                <th
                  key={header.id}
                  onClick={header.column.getToggleSortingHandler()}
                  className={`px-3 py-2 font-medium ${
                    header.column.getCanSort() ? 'cursor-pointer select-none' : ''
                  }`}
                >
                  {flexRender(
                    header.column.columnDef.header,
                    header.getContext(),
                  )}
                  {{ asc: ' ↑', desc: ' ↓' }[
                    header.column.getIsSorted() as string
                  ] ?? ''}
                </th>
              ))}
            </tr>
          ))}
        </thead>
        <tbody>
          {table.getRowModel().rows.map((row) => (
            <tr key={row.id} className="border-b border-gray-100 hover:bg-gray-50">
              {row.getVisibleCells().map((cell) => (
                <td key={cell.id} className="px-3 py-2 align-middle">
                  {flexRender(cell.column.columnDef.cell, cell.getContext())}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
