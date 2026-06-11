import { Box, HStack, Table, Text } from '@chakra-ui/react';
import { flexRender, type Table as ReactTable } from '@tanstack/react-table';
import type { Listing } from '../../types';

interface ListingsTableHeaderProps {
  table: ReactTable<Listing>;
}

export function ListingsTableHeader({ table }: ListingsTableHeaderProps) {
  return (
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
  );
}
