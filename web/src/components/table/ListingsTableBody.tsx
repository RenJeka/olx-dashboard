import { Table } from '@chakra-ui/react';
import { flexRender, type Table as ReactTable } from '@tanstack/react-table';
import type { Listing } from '../../types';

interface ListingsTableBodyProps {
  table: ReactTable<Listing>;
}

export function ListingsTableBody({ table }: ListingsTableBodyProps) {
  return (
    <Table.Body>
      {table.getRowModel().rows.map((row) => (
        <Table.Row key={row.id}>
          {row.getVisibleCells().map((cell) => {
            const isWideText = cell.column.id === 'title' || cell.column.id === 'description';
            return (
              <Table.Cell
                key={cell.id}
                verticalAlign="middle"
                style={{ width: cell.column.getSize() }}
                whiteSpace={isWideText ? 'normal' : 'nowrap'}
                overflow={isWideText ? undefined : 'hidden'}
                textOverflow={isWideText ? undefined : 'ellipsis'}
              >
                {flexRender(cell.column.columnDef.cell, cell.getContext())}
              </Table.Cell>
            );
          })}
        </Table.Row>
      ))}
    </Table.Body>
  );
}
