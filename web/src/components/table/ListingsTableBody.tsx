import { Table } from '@chakra-ui/react';
import type { Table as ReactTable } from '@tanstack/react-table';
import type { Listing } from '../../types';
import { ListingsTableRow } from './ListingsTableRow';

interface ListingsTableBodyProps {
  table: ReactTable<Listing>;
  descriptionExpandEnabled: boolean;
  onOpenDescription: (listing: Listing) => void;
  searchQuery: string;
  columnLayoutKey: string;
}

export function ListingsTableBody({
  table,
  descriptionExpandEnabled,
  onOpenDescription,
  searchQuery,
  columnLayoutKey,
}: ListingsTableBodyProps) {
  return (
    <Table.Body>
      {table.getRowModel().rows.map((row) => (
        <ListingsTableRow
          key={row.id}
          row={row}
          isSelected={row.getIsSelected()}
          descriptionExpandEnabled={descriptionExpandEnabled}
          onOpenDescription={onOpenDescription}
          searchQuery={searchQuery}
          columnLayoutKey={columnLayoutKey}
        />
      ))}
    </Table.Body>
  );
}
