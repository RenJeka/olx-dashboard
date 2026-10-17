import { useMemo, useState } from 'react';
import { Box, Button, HStack, IconButton, Input, Spinner, Stack, Text } from '@chakra-ui/react';
import { LuChevronDown, LuChevronRight, LuRefreshCw, LuSearch } from 'react-icons/lu';
import { Tooltip } from '../../ui/tooltip';
import { toaster } from '../../ui/toaster';
import { ApiError, useCollectCategories } from '../../../api';
import { showErrorToast } from '../../../utils/toast';
import { flattenTree, type CategoryIndex } from '../../../utils/olxCategoryTree';

interface Props {
  index: CategoryIndex;
  isLoading: boolean;
  selectedId: number | null;
  onSelect: (id: number) => void;
  /** Розкриті вузли — у батька, щоб при виборі розкрити предків обраного. */
  expanded: Set<number>;
  onToggle: (id: number) => void;
}

/**
 * Ліва панель вікна «Базові плюси й мінуси»: пошук за назвою, згортання гілок, позначка «є набір»
 * і «Оновити дерево категорій» (збір з OLX, близько хвилини).
 */
export function CategoryTree({ index, isLoading, selectedId, onSelect, expanded, onToggle }: Props) {
  const [query, setQuery] = useState('');
  const collect = useCollectCategories();
  const rows = useMemo(() => flattenTree(index, expanded, query), [index, expanded, query]);
  const searching = query.trim().length > 0;

  async function runCollect() {
    try {
      const res = await collect.mutateAsync();
      toaster.create({
        type: res.failed.length > 0 ? 'warning' : 'success',
        title: `Додано/оновлено ${res.changed}`,
        description: res.failed.length > 0 ? `Не вдалося для слів: ${res.failed.join(', ')}` : undefined,
      });
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) toaster.create({ type: 'info', title: 'Збір уже йде' });
      else showErrorToast('Не вдалося оновити дерево категорій', err);
    }
  }

  return (
    <Stack gap={2} minH={0} h="full">
      <Button
        size="xs"
        variant="outline"
        loading={collect.isPending}
        loadingText="Збираю з OLX (~1 хв)…"
        onClick={() => void runCollect()}
      >
        <LuRefreshCw /> Оновити дерево категорій
      </Button>
      <HStack gap={1}>
        <LuSearch />
        <Input size="xs" placeholder="пошук категорії" value={query} onChange={(e) => setQuery(e.target.value)} />
      </HStack>
      <Box flex="1" minH={0} overflowY="auto">
        {isLoading ? (
          <Spinner size="sm" />
        ) : rows.length === 0 ? (
          <Text textStyle="sm" color="fg.muted" py={2}>
            {searching ? 'Нічого не знайдено.' : 'Дерево порожнє — натисни «Оновити дерево категорій».'}
          </Text>
        ) : (
          rows.map(({ node, depth, hasChildren, expanded: open }) => (
            <HStack key={node.id} gap={0} pl={depth * 3}>
              {hasChildren && !searching ? (
                <IconButton
                  size="2xs"
                  variant="ghost"
                  aria-label={open ? `Згорнути «${node.label}»` : `Розгорнути «${node.label}»`}
                  onClick={() => onToggle(node.id)}
                >
                  {open ? <LuChevronDown /> : <LuChevronRight />}
                </IconButton>
              ) : (
                <Box w={6} flexShrink={0} />
              )}
              <Button
                size="xs"
                variant={node.id === selectedId ? 'subtle' : 'ghost'}
                colorPalette={node.id === selectedId ? 'accent' : 'gray'}
                flex="1"
                minW={0}
                justifyContent="flex-start"
                fontWeight="normal"
                onClick={() => onSelect(node.id)}
              >
                <Text as="span" truncate>
                  {node.label}
                </Text>
              </Button>
              {node.hasSet && (
                <Tooltip content="є набір" openDelay={300}>
                  <Box
                    w={2}
                    h={2}
                    mx={1.5}
                    flexShrink={0}
                    borderRadius="full"
                    bg="accent.solid"
                    aria-label="є набір"
                    role="img"
                  />
                </Tooltip>
              )}
            </HStack>
          ))
        )}
      </Box>
    </Stack>
  );
}
