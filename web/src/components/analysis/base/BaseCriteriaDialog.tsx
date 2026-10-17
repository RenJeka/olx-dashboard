import { useMemo, useRef, useState } from 'react';
import { Box, Button, Stack, Text } from '@chakra-ui/react';
import { LuChevronDown, LuChevronUp } from 'react-icons/lu';
import {
  DialogBackdrop,
  DialogBody,
  DialogCloseTrigger,
  DialogContent,
  DialogHeader,
  DialogRoot,
  DialogTitle,
} from '../../ui/dialog';
import { CategoryTree } from './CategoryTree';
import { BaseCriteriaPane } from './BaseCriteriaPane';
import { useOlxCategories } from '../../../api';
import { useIsMobile } from '../../../hooks/useIsMobile';
import { ancestorIds, categoryPath, indexCategories } from '../../../utils/olxCategoryTree';
import type { AnalysisMode } from '../../../types';

interface Props {
  onClose: () => void;
}

/**
 * Вікно «Базові плюси й мінуси» (docs/plans/base-criteria.md): ліворуч — дерево категорій OLX, праворуч — набір
 * обраної категорії (власні пункти + успадковані). На вузькому екрані панелі одна під одною, дерево згортається.
 * Вхід — «Налаштування» → «AI-аналіз». Монтувати лише на час показу (`{open && <BaseCriteriaDialog … />}`).
 */
export function BaseCriteriaDialog({ onClose }: Props) {
  const isMobile = useIsMobile();
  const contentRef = useRef<HTMLDivElement>(null);
  const { data: categories, isLoading } = useOlxCategories();
  const index = useMemo(() => indexCategories(categories ?? []), [categories]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const [mode, setMode] = useState<AnalysisMode>('cons');
  /** Мобільний: дерево розгорнуте, доки категорію не обрано. */
  const [treeOpen, setTreeOpen] = useState(true);

  const path = selectedId !== null ? categoryPath(index, selectedId) : [];

  function select(id: number) {
    setSelectedId(id);
    // Предки обраного — розкриті: після очищення пошуку вузол видно в дереві.
    setExpanded((prev) => new Set([...prev, ...ancestorIds(index, id)]));
    if (isMobile) setTreeOpen(false);
  }

  function toggle(id: number) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const tree = (
    <CategoryTree
      index={index}
      isLoading={isLoading}
      selectedId={selectedId}
      onSelect={select}
      expanded={expanded}
      onToggle={toggle}
    />
  );

  const pane =
    selectedId === null ? (
      <Text textStyle="sm" color="fg.muted" py={2}>
        Обери категорію {isMobile ? 'вище' : 'ліворуч'}: її набір успадкують пошуки цієї категорії та підкатегорій.
      </Text>
    ) : (
      <Stack gap={3}>
        <Text textStyle="sm" fontWeight="semibold">
          {path.join(' → ')}
        </Text>
        <BaseCriteriaPane
          key={selectedId}
          categoryId={selectedId}
          initialMode={mode}
          onModeChange={setMode}
          portalRef={contentRef}
        />
      </Stack>
    );

  return (
    <DialogRoot
      open
      onOpenChange={(d) => !d.open && onClose()}
      size={isMobile ? 'full' : 'xl'}
      placement="center"
      scrollBehavior="inside"
      // Закриття — лише хрестиком (або Escape), не кліком повз вікно.
      closeOnInteractOutside={false}
    >
      <DialogBackdrop />
      <DialogContent ref={contentRef} h={isMobile ? undefined : '85vh'}>
        <DialogCloseTrigger />
        <DialogHeader>
          <Stack gap={0.5}>
            <DialogTitle>Базові плюси й мінуси</DialogTitle>
            <Text textStyle="xs" color="fg.muted">
              Набір категорії OLX успадковують усі пошуки в ній і в її підкатегоріях.
            </Text>
          </Stack>
        </DialogHeader>

        {isMobile ? (
          <DialogBody pb={4}>
            <Stack gap={3}>
              <Button size="sm" variant="outline" justifyContent="space-between" onClick={() => setTreeOpen((v) => !v)}>
                <Text as="span" truncate>
                  {path.length > 0 ? path[path.length - 1] : 'Обрати категорію'}
                </Text>
                {treeOpen ? <LuChevronUp /> : <LuChevronDown />}
              </Button>
              {treeOpen && (
                <Box h="45vh" borderWidth="1px" borderColor="border.subtle" borderRadius="md" p={2}>
                  {tree}
                </Box>
              )}
              {pane}
            </Stack>
          </DialogBody>
        ) : (
          <DialogBody pb={4} display="flex" gap={4} overflow="hidden" minH={0}>
            <Box w="280px" flexShrink={0} minH={0} pr={3} borderRightWidth="1px" borderColor="border.subtle">
              {tree}
            </Box>
            <Box flex="1" minW={0} minH={0} overflowY="auto" pr={1}>
              {pane}
            </Box>
          </DialogBody>
        )}
      </DialogContent>
    </DialogRoot>
  );
}
