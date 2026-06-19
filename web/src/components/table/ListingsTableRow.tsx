import { memo, type ReactNode } from 'react';
import { HStack, Table } from '@chakra-ui/react';
import { flexRender, type Row } from '@tanstack/react-table';
import { LuFilter, LuScanSearch } from 'react-icons/lu';
import type { Listing } from '../../types';
import { DescriptionTooltip } from './DescriptionTooltip';
import { Tooltip } from '../ui/tooltip';
import { isMutedStatus } from '../../utils/status';
import { getDateCellStyle } from './columns';
import { useUpdateListing } from '../../api';

interface ListingsTableRowProps {
  row: Row<Listing>;
  isSelected: boolean;
  descriptionExpandEnabled: boolean;
  onOpenDescription: (listing: Listing) => void;
  searchQuery: string;
  /** Підпис видимих колонок (їх id у поточному порядку) — сигнал memo для reorder/visibility. */
  columnLayoutKey: string;
}

function ListingsTableRowImpl({
  row,
  isSelected,
  descriptionExpandEnabled,
  onOpenDescription,
  searchQuery,
}: ListingsTableRowProps) {
  const updateListing = useUpdateListing();
  return (
    <Table.Row
      opacity={isMutedStatus(row.original.status) ? 0.5 : undefined}
      bg={isSelected ? 'blue.50/60' : undefined}
      _dark={isSelected ? { bg: 'blue.950/40' } : undefined}
    >
      {row.getVisibleCells().map((cell) => {
        const isWideText =
          cell.column.id === 'title' ||
          cell.column.id === 'description' ||
          cell.column.id === 'note';
        const rendered = flexRender(cell.column.columnDef.cell, cell.getContext());
        let content: ReactNode = rendered;

        if (cell.column.id === 'description' && descriptionExpandEnabled) {
          content = (
            <DescriptionTooltip
              description={row.original.description}
              query={searchQuery}
              onClick={() => onOpenDescription(row.original)}
            >
              {rendered}
            </DescriptionTooltip>
          );
        }

        if (cell.column.id === 'title' && row.original.filtered_out === 1) {
          content = (
            <HStack gap={1}>
              <Tooltip content="Приховано локальним фільтром">
                <span>
                  <LuFilter color="var(--chakra-colors-orange-500)" />
                </span>
              </Tooltip>
              {content}
            </HStack>
          );
        }

        if (cell.column.id === 'title' && row.original.ai_relevant === 0) {
          const reason = row.original.ai_relevant_reason || 'AI: лот не продає цільовий товар';
          content = (
            <HStack gap={1}>
              <Tooltip content={`${reason} — натисни, щоб позначити релевантним`}>
                <span
                  role="button"
                  tabIndex={0}
                  style={{ cursor: 'pointer', display: 'inline-flex' }}
                  onClick={() =>
                    updateListing.mutate({
                      id: row.original.id,
                      searchId: row.original.search_id,
                      patch: { ai_relevant: 1 },
                    })
                  }
                >
                  <LuScanSearch color="var(--chakra-colors-cyan-500)" />
                </span>
              </Tooltip>
              {content}
            </HStack>
          );
        }

        // Колонка «Дата»: заливаємо ВСЮ комірку (з паддингами) яскравим фоном за свіжістю.
        const dateStyle =
          cell.column.id === 'posted_at' ? getDateCellStyle(row.original.posted_at) : null;

        return (
          <Table.Cell
            key={cell.id}
            verticalAlign="middle"
            style={{ width: cell.column.getSize() }}
            whiteSpace={isWideText ? 'normal' : 'nowrap'}
            overflow={isWideText ? undefined : 'hidden'}
            textOverflow={isWideText ? undefined : 'ellipsis'}
            bg={dateStyle?.bg}
            color={dateStyle?.color}
          >
            {content}
          </Table.Cell>
        );
      })}
    </Table.Row>
  );
}

/**
 * Рядок перерендерюється лише коли змінюються дані рядка чи стан, що впливає на
 * його вміст. `row.original` — стабільне посилання з кешу TanStack (нове лише при
 * зміні даних). Пагінація/сортування/ресайз колонок не змінюють вміст рядка
 * (ширини задаються заголовком при `tableLayout: 'fixed'`), тож такі рендери
 * пропускаються — головна економія сміття на взаємодію. ВАЖЛИВО: зміна порядку
 * чи видимості колонок НЕ перестворює об'єкт `row` у TanStack, тож без
 * `columnLayoutKey` (підпис `getVisibleLeafColumns`) memo пропустив би ререндер і
 * тіло розсинхронізувалось би із заголовком.
 */
function arePropsEqual(prev: ListingsTableRowProps, next: ListingsTableRowProps): boolean {
  return (
    prev.row.id === next.row.id &&
    prev.row.original === next.row.original &&
    prev.isSelected === next.isSelected &&
    prev.descriptionExpandEnabled === next.descriptionExpandEnabled &&
    prev.searchQuery === next.searchQuery &&
    prev.onOpenDescription === next.onOpenDescription &&
    prev.columnLayoutKey === next.columnLayoutKey
  );
}

export const ListingsTableRow = memo(ListingsTableRowImpl, arePropsEqual);
