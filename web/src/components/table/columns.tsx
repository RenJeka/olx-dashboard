import { createColumnHelper } from '@tanstack/react-table';
import { Badge, Box, HStack, Image, Link, Text } from '@chakra-ui/react';
import {
  LuCalendar,
  LuCircleCheck,
  LuExternalLink,
  LuFileText,
  LuImage,
  LuMapPin,
  LuNotebookPen,
  LuSparkles,
  LuTag,
  LuThumbsDown,
  LuThumbsUp,
  LuUser,
} from 'react-icons/lu';
import { TbBrandDaysCounter } from 'react-icons/tb';
import { Tooltip } from '../ui/tooltip';
import type { Listing } from '../../types';
import { HeaderLabel } from './HeaderLabel';
import { formatPrice, formatDate, stripDescriptionHtml, countProsConsItems } from '../../utils/format';
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
      const value = info.getValue();
      const d = formatDate(value);
      if (!d || !value) return '—';

      let bg: string | undefined = undefined;
      const posted = new Date(value);
      const today = new Date();
      posted.setHours(0, 0, 0, 0);
      today.setHours(0, 0, 0, 0);
      const diffDays = Math.floor((today.getTime() - posted.getTime()) / (1000 * 60 * 60 * 24));
      
      if (diffDays === 0) bg = "blue.subtle";
      else if (diffDays === 1) bg = "blue.subtle/70";
      else if (diffDays === 2) bg = "blue.subtle/50";
      else if (diffDays === 3) bg = "blue.subtle/30";
      else if (diffDays === 4) bg = "blue.subtle/15";
      else if (diffDays === 5) bg = "blue.subtle/10";
      else if (diffDays === 6) bg = "blue.subtle/5";

      const content = (
        <Text as="span" cursor="default" title={d.full}>
          {d.short}
        </Text>
      );

      return bg ? (
        <Box as="span" px={1.5} py={0.5} rounded="sm" bg={bg} display="inline-block" position="relative">
          {diffDays === 0 && (
            <Box position="absolute" top="-1.5" left="-2" color="blue.fg" bg="bg.panel" rounded="full" title="Сьогодні">
              <TbBrandDaysCounter size={14} />
            </Box>
          )}
          {content}
        </Box>
      ) : content;
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
    // Сортування за кількістю пунктів: більше плюсів — вищий пріоритет.
    // `sortDescFirst` — перший клік одразу дає спадання (найбільше зверху).
    sortDescFirst: true,
    sortingFn: (a, b) =>
      countProsConsItems(a.original.pros) - countProsConsItems(b.original.pros),
    cell: (info) => <ProsConsCell listing={info.row.original} field="pros" />,
  }),
  columnHelper.accessor('cons', {
    id: 'cons',
    header: () => <HeaderLabel icon={<LuThumbsDown color="red" />}>Мінуси</HeaderLabel>,
    size: 200,
    minSize: 120,
    maxSize: 400,
    // Сортування за кількістю пунктів: більше мінусів — вищий пріоритет.
    // `sortDescFirst` — перший клік одразу дає спадання (найбільше зверху).
    sortDescFirst: true,
    sortingFn: (a, b) =>
      countProsConsItems(a.original.cons) - countProsConsItems(b.original.cons),
    cell: (info) => <ProsConsCell listing={info.row.original} field="cons" />,
  }),
  columnHelper.accessor('ai_rank', {
    id: 'ai_rank',
    header: () => <HeaderLabel icon={<LuSparkles />}>AI Ранг</HeaderLabel>,
    size: 90,
    minSize: 60,
    maxSize: 120,
    enableSorting: true,
    sortDescFirst: false,
    cell: (info) => {
      const rank = info.getValue();
      if (rank == null) return null;
      const reason = info.row.original.ai_pick_reason ?? '';
      return (
        <Tooltip content={reason} disabled={!reason}>
          <Text fontWeight="semibold" cursor={reason ? 'help' : 'default'}>
            #{rank}
          </Text>
        </Tooltip>
      );
    },
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
  { id: 'ai_rank', label: 'AI Ранг' },
];
