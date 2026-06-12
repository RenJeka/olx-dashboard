import { memo, type ReactNode } from 'react';
import { Table } from '@chakra-ui/react';
import { flexRender, type Row } from '@tanstack/react-table';
import type { Listing } from '../../types';
import { DescriptionTooltip } from './DescriptionTooltip';
import { isMutedStatus } from '../../utils/status';

interface ListingsTableRowProps {
  row: Row<Listing>;
  descriptionExpandEnabled: boolean;
  onOpenDescription: (listing: Listing) => void;
  searchQuery: string;
}

export const ListingsTableRow = memo(function ListingsTableRow({
  row,
  descriptionExpandEnabled,
  onOpenDescription,
  searchQuery,
}: ListingsTableRowProps) {
  return (
    <Table.Row opacity={isMutedStatus(row.original.status) ? 0.5 : undefined}>
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

        return (
          <Table.Cell
            key={cell.id}
            verticalAlign="middle"
            style={{ width: cell.column.getSize() }}
            whiteSpace={isWideText ? 'normal' : 'nowrap'}
            overflow={isWideText ? undefined : 'hidden'}
            textOverflow={isWideText ? undefined : 'ellipsis'}
          >
            {content}
          </Table.Cell>
        );
      })}
    </Table.Row>
  );
});
