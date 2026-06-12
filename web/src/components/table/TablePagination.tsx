import { ButtonGroup, HStack, IconButton, NativeSelect, Pagination, Text } from '@chakra-ui/react';
import { LuChevronLeft, LuChevronRight } from 'react-icons/lu';
import type { Table as ReactTable } from '@tanstack/react-table';
import type { Listing } from '../../types';

const PAGE_SIZE_OPTIONS = [25, 50, 100, 200] as const;

interface TablePaginationProps {
  table: ReactTable<Listing>;
}

export function TablePagination({ table }: TablePaginationProps) {
  const { pageIndex, pageSize } = table.getState().pagination;
  const totalRows = table.getPrePaginationRowModel().rows.length;

  if (totalRows === 0) return null;

  return (
    <HStack
      justify="space-between"
      flexWrap="wrap"
      gap={3}
      px={4}
      py={2}
      borderTopWidth="1px"
      borderColor="border.subtle"
      flexShrink={0}
    >
      <HStack gap={2}>
        <Text textStyle="sm" color="fg.muted" whiteSpace="nowrap">
          Рядків на сторінці
        </Text>
        <NativeSelect.Root size="sm" w="20">
          <NativeSelect.Field
            value={pageSize}
            onChange={(e) => table.setPageSize(Number(e.target.value))}
            cursor="pointer"
          >
            {PAGE_SIZE_OPTIONS.map((size) => (
              <option key={size} value={size}>
                {size}
              </option>
            ))}
          </NativeSelect.Field>
          <NativeSelect.Indicator />
        </NativeSelect.Root>
      </HStack>
      <Pagination.Root
        count={totalRows}
        pageSize={pageSize}
        page={pageIndex + 1}
        onPageChange={(details) => table.setPageIndex(details.page - 1)}
        translations={{
          prevTriggerLabel: 'Попередня сторінка',
          nextTriggerLabel: 'Наступна сторінка',
        }}
      >
        <HStack gap={3}>
          <Pagination.PageText
            format={({ pageRange, count }) =>
              `${pageRange.start + 1}–${pageRange.end} з ${count.toLocaleString('uk-UA')}`
            }
          />
          <ButtonGroup size="sm" variant="ghost" attached>
            <Pagination.PrevTrigger asChild>
              <IconButton>
                <LuChevronLeft />
              </IconButton>
            </Pagination.PrevTrigger>
            <Pagination.Items
              render={(page) => (
                <IconButton
                  variant={page.value === pageIndex + 1 ? 'outline' : 'ghost'}
                  colorPalette={page.value === pageIndex + 1 ? 'blue' : undefined}
                >
                  {page.value}
                </IconButton>
              )}
            />
            <Pagination.NextTrigger asChild>
              <IconButton>
                <LuChevronRight />
              </IconButton>
            </Pagination.NextTrigger>
          </ButtonGroup>
        </HStack>
      </Pagination.Root>
    </HStack>
  );
}
