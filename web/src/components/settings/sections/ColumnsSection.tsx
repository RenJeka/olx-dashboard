import { Stack, Text } from '@chakra-ui/react';
import type { OnChangeFn, VisibilityState } from '@tanstack/react-table';
import { TOGGLEABLE_COLUMNS } from '../../table/columns';
import { Checkbox } from '../../ui/checkbox';

interface ColumnsSectionProps {
  columnVisibility: VisibilityState;
  onColumnVisibilityChange: OnChangeFn<VisibilityState>;
}

export function ColumnsSection({
  columnVisibility,
  onColumnVisibilityChange,
}: ColumnsSectionProps) {
  return (
    <Stack gap={3}>
      <Text fontWeight="medium">Колонки таблиці</Text>
      <Stack gap={2}>
        {TOGGLEABLE_COLUMNS.map((col) => (
          <Checkbox
            key={col.id}
            checked={columnVisibility[col.id] !== false}
            onCheckedChange={(details) =>
              onColumnVisibilityChange((prev) => ({
                ...prev,
                [col.id]: details.checked === true,
              }))
            }
          >
            {col.label}
          </Checkbox>
        ))}
      </Stack>
    </Stack>
  );
}
