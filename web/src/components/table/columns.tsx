import { createColumnHelper } from '@tanstack/react-table';
import { Badge, Box, HStack, Image, Link, Text } from '@chakra-ui/react';
import { Tooltip } from '../ui/tooltip';
import {
  LuCalendar,
  LuCircleCheck,
  LuExternalLink,
  LuFileText,
  LuImage,
  LuMapPin,
  LuNotebookPen,
  LuTag,
  LuThumbsDown,
  LuThumbsUp,
  LuUser,
} from 'react-icons/lu';
import type { Listing } from '../../types';
import { HeaderLabel } from './HeaderLabel';
import { formatPrice, formatDate, stripDescriptionHtml } from '../../utils/format';
import { StatusCell } from './StatusCell';
import { NoteCell } from './NoteCell';
import { ProsConsCell } from './ProsConsCell';
import { HighlightText } from './HighlightText';
import { Checkbox } from '../ui/checkbox';

const columnHelper = createColumnHelper<Listing>();

export const columns = [
  columnHelper.display({
    id: 'select',
    header: ({ table }) => (
      <Checkbox
        checked={
          table.getIsAllPageRowsSelected()
            ? true
            : table.getIsSomePageRowsSelected()
              ? 'indeterminate'
              : false
        }
        onCheckedChange={(details) => table.toggleAllPageRowsSelected(details.checked === true)}
        aria-label="Вибрати всі на сторінці"
      />
    ),
    cell: ({ row }) => (
      <Checkbox
        checked={row.getIsSelected()}
        onCheckedChange={(details) => row.toggleSelected(details.checked === true)}
        aria-label="Вибрати рядок"
      />
    ),
    enableSorting: false,
    enableResizing: false,
    enableHiding: false,
    size: 36,
    minSize: 36,
    maxSize: 36,
  }),
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
      const query = String(info.table.getState().globalFilter ?? '');
      const content = <HighlightText text={title} query={query} />;
      return url ? (
        <Link href={url} target="_blank" rel="noreferrer" colorPalette="blue" color="colorPalette.fg">
          <HStack gap={1}>
            <Text>{content}</Text>
            <LuExternalLink />
          </HStack>
        </Link>
      ) : (
        content
      );
    },
  }),
  columnHelper.accessor('description', {
    header: () => <HeaderLabel icon={<LuFileText />}>Опис</HeaderLabel>,
    size: 320,
    minSize: 160,
    maxSize: 600,
    enableSorting: false,
    cell: (info) => {
      const text = stripDescriptionHtml(info.getValue());
      if (!text) return '—';
      const query = String(info.table.getState().globalFilter ?? '');
      return (
        <Text whiteSpace="pre-line" lineClamp={3}>
          <HighlightText text={text} query={query} />
        </Text>
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
    cell: (info) => {
      const d = formatDate(info.getValue());
      if (!d) return '—';
      return (
        <Tooltip content={d.full} openDelay={200} closeDelay={100}>
          <Text as="span" cursor="default">
            {d.short}
          </Text>
        </Tooltip>
      );
    },
  }),
  columnHelper.accessor((row) => row.contact_name ?? row.seller_name ?? null, {
    id: 'seller',
    header: () => <HeaderLabel icon={<LuUser />}>Продавець</HeaderLabel>,
    size: 160,
    minSize: 100,
    maxSize: 280,
    enableSorting: false,
    cell: (info) => info.getValue() ?? '—',
  }),
  columnHelper.accessor('olx_status', {
    header: () => <HeaderLabel icon={<LuCircleCheck />}>Статус OLX</HeaderLabel>,
    size: 110,
    minSize: 90,
    maxSize: 160,
    enableSorting: false,
    cell: (info) => {
      const value = info.getValue();
      if (!value) return '—';
      return <Badge colorPalette={value === 'active' ? 'green' : 'gray'}>{value}</Badge>;
    },
  }),
  columnHelper.accessor('status', {
    id: 'status',
    header: () => <HeaderLabel icon={<LuCircleCheck />}>Статус</HeaderLabel>,
    size: 130,
    minSize: 110,
    maxSize: 160,
    enableSorting: false,
    cell: (info) => <StatusCell listing={info.row.original} />,
  }),
  columnHelper.accessor('note', {
    id: 'note',
    header: () => <HeaderLabel icon={<LuNotebookPen />}>Нотатка</HeaderLabel>,
    size: 220,
    minSize: 140,
    maxSize: 400,
    enableSorting: false,
    cell: (info) => <NoteCell listing={info.row.original} />,
  }),
  columnHelper.accessor('pros', {
    id: 'pros',
    header: () => <HeaderLabel icon={<LuThumbsUp color="green" />}>Плюси</HeaderLabel>,
    size: 200,
    minSize: 120,
    maxSize: 400,
    enableSorting: false,
    cell: (info) => <ProsConsCell listing={info.row.original} field="pros" />,
  }),
  columnHelper.accessor('cons', {
    id: 'cons',
    header: () => <HeaderLabel icon={<LuThumbsDown color="red" />}>Мінуси</HeaderLabel>,
    size: 200,
    minSize: 120,
    maxSize: 400,
    enableSorting: false,
    cell: (info) => <ProsConsCell listing={info.row.original} field="cons" />,
  }),
];

export const TOGGLEABLE_COLUMNS: { id: string; label: string }[] = [
  { id: 'photo_url', label: 'Фото' },
  { id: 'title', label: 'Назва' },
  { id: 'description', label: 'Опис' },
  { id: 'price', label: 'Ціна' },
  { id: 'city', label: 'Місто' },
  { id: 'posted_at', label: 'Дата' },
  { id: 'seller', label: 'Продавець' },
  { id: 'olx_status', label: 'Статус OLX' },
  { id: 'status', label: 'Статус' },
  { id: 'note', label: 'Нотатка' },
  { id: 'pros', label: 'Плюси' },
  { id: 'cons', label: 'Мінуси' },
];
