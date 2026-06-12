import { useRef, useState } from 'react';
import { Box, HStack, Stack, Text } from '@chakra-ui/react';
import type { OnChangeFn, VisibilityState } from '@tanstack/react-table';
import { LuGripVertical } from 'react-icons/lu';
import { Checkbox } from '../../ui/checkbox';
import { getOrderedColumns } from '../../../utils/columns';

interface ColumnsSectionProps {
  columnVisibility: VisibilityState;
  onColumnVisibilityChange: OnChangeFn<VisibilityState>;
  columnOrder: string[];
  onColumnOrderChange: (order: string[]) => void;
}


export function ColumnsSection({
  columnVisibility,
  onColumnVisibilityChange,
  columnOrder,
  onColumnOrderChange,
}: ColumnsSectionProps) {
  const orderedCols = getOrderedColumns(columnOrder);

  const dragSrcIndex = useRef<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

  function handleDragStart(index: number) {
    dragSrcIndex.current = index;
  }

  function handleDragOver(e: React.DragEvent, index: number) {
    e.preventDefault();
    setDragOverIndex(index);
  }

  function handleDrop(targetIndex: number) {
    const src = dragSrcIndex.current;
    if (src === null || src === targetIndex) {
      setDragOverIndex(null);
      return;
    }
    const newOrder = orderedCols.map((c) => c.id);
    const moved = newOrder.splice(src, 1)[0];
    if (moved === undefined) return;
    newOrder.splice(targetIndex, 0, moved);
    onColumnOrderChange(newOrder);
    dragSrcIndex.current = null;
    setDragOverIndex(null);
  }

  function handleDragEnd() {
    dragSrcIndex.current = null;
    setDragOverIndex(null);
  }

  return (
    <Stack gap={3}>
      <Text fontWeight="medium">Колонки таблиці</Text>
      <Text fontSize="xs" color="fg.muted">
        Перетягуй ⠿ щоб змінити порядок; чекбокс — показати/сховати.
      </Text>
      <Stack gap={1}>
        {orderedCols.map((col, index) => {
          const isDragOver = dragOverIndex === index;
          return (
            <Box
              key={col.id}
              draggable
              onDragStart={() => handleDragStart(index)}
              onDragOver={(e) => handleDragOver(e, index)}
              onDrop={() => handleDrop(index)}
              onDragEnd={handleDragEnd}
              borderWidth="1px"
              borderColor={isDragOver ? 'blue.500' : 'border.subtle'}
              borderRadius="md"
              bg={isDragOver ? 'blue.subtle' : 'bg.subtle'}
              px={2}
              py={1.5}
              cursor="default"
              transition="border-color 0.15s, background 0.15s"
              _hover={{ bg: 'bg.muted' }}
              userSelect="none"
            >
              <HStack gap={2}>
                <Box
                  as="span"
                  cursor="grab"
                  color="fg.muted"
                  _hover={{ color: 'fg' }}
                  flexShrink={0}
                  aria-hidden
                >
                  <LuGripVertical />
                </Box>
                <Checkbox
                  flex="1"
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
              </HStack>
            </Box>
          );
        })}
      </Stack>
    </Stack>
  );
}
