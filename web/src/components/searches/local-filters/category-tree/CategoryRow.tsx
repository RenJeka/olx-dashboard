import type { ReactNode } from 'react';
import { Box, HStack, Icon, Text } from '@chakra-ui/react';
import { LuChevronDown, LuChevronRight } from 'react-icons/lu';
import { Checkbox } from '../../../ui/checkbox';
import { nodeCheckedState, type CategoryTreeNode } from '../../../../utils/categoryCounts';
import { CountChip } from './CountChip';

/** Відступ на рівень вкладеності дерева категорій (rem). */
const TREE_INDENT_REM = 1.25;

interface RowProps {
  node: CategoryTreeNode;
  collapsed: Set<string>;
  selected: Set<number>;
  olxHint: ReactNode;
  onToggleCollapse: (key: string) => void;
  onToggle: (ids: number[], checked: boolean) => void;
}

/** Рядок дерева категорій: chevron (для гілок) + чекбокс + назва + лічильник; рекурсивно діти. */
export function CategoryRow({ node, collapsed, selected, olxHint, onToggleCollapse, onToggle }: RowProps) {
  const hasChildren = node.children.length > 0;
  const isCollapsed = collapsed.has(node.key);

  return (
    <>
      <Box
        pl={`${node.depth * TREE_INDENT_REM}rem`}
        borderRadius="sm"
        transition="background 0.12s"
        _hover={{ bg: 'bg.muted' }}
      >
        <HStack justify="space-between" gap={3} py={1} pr={1.5}>
          <HStack gap={1} minW={0}>
            {hasChildren ? (
              <Box
                as="button"
                onClick={() => onToggleCollapse(node.key)}
                aria-label={isCollapsed ? 'Розгорнути' : 'Згорнути'}
                display="flex"
                alignItems="center"
                justifyContent="center"
                w="4"
                flexShrink={0}
                color="fg.muted"
                _hover={{ color: 'fg' }}
              >
                <Icon as={isCollapsed ? LuChevronRight : LuChevronDown} boxSize={3.5} />
              </Box>
            ) : (
              <Box w="4" flexShrink={0} />
            )}
            <Checkbox
              size="sm"
              checked={nodeCheckedState(node, selected)}
              onCheckedChange={(d) => onToggle(node.leafIds, d.checked === true)}
            >
              <Text textStyle="sm" fontWeight={node.depth === 0 ? 'medium' : 'normal'}>
                {node.label}
              </Text>
            </Checkbox>
          </HStack>
          <CountChip node={node} olxHint={olxHint} />
        </HStack>
      </Box>

      {hasChildren &&
        !isCollapsed &&
        node.children.map((child) => (
          <CategoryRow
            key={child.key}
            node={child}
            collapsed={collapsed}
            selected={selected}
            olxHint={olxHint}
            onToggleCollapse={onToggleCollapse}
            onToggle={onToggle}
          />
        ))}
    </>
  );
}
