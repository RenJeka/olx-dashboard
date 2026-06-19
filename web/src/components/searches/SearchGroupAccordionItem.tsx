import type { ReactNode } from 'react';
import { Accordion, Badge, HStack, Stack, Text } from '@chakra-ui/react';
import { SearchRow } from './SearchRow';
import type { Search } from '../../types';

interface Props {
  value: string;
  icon: ReactNode;
  label: string;
  badgeColorPalette: string;
  items: Search[];
  selectedId: number | null;
  onSelect: (id: number) => void;
  onDeleted: (id: number) => void;
  isLoading?: boolean;
  emptyMessage?: string;
}

/** Секція акордеону зі списком пошуків — спільна для вкладок «Пошуки» й «Архів». */
export function SearchGroupAccordionItem({
  value,
  icon,
  label,
  badgeColorPalette,
  items,
  selectedId,
  onSelect,
  onDeleted,
  isLoading = false,
  emptyMessage,
}: Props) {
  return (
    <Accordion.Item value={value} borderBottomWidth="1px" borderColor="border.subtle">
      <Accordion.ItemTrigger px={4} py={3} cursor="pointer" _hover={{ bg: 'bg.muted' }}>
        <HStack flex="1" gap={2} fontWeight="semibold">
          {icon}
          <Text>{label}</Text>
          {items.length > 0 && (
            <Badge colorPalette={badgeColorPalette} variant="subtle" rounded="full">
              {items.length}
            </Badge>
          )}
        </HStack>
        <Accordion.ItemIndicator />
      </Accordion.ItemTrigger>
      <Accordion.ItemContent>
        <Accordion.ItemBody px={2} pt={0} pb={2}>
          {isLoading && (
            <Text textStyle="sm" color="fg.muted" px={2}>
              Завантаження…
            </Text>
          )}
          {!isLoading && items.length === 0 && emptyMessage && (
            <Text textStyle="sm" color="fg.muted" px={2}>
              {emptyMessage}
            </Text>
          )}
          <Stack gap="0.5">
            {items.map((s, index) => (
              <SearchRow
                key={s.id}
                search={s}
                selected={selectedId === s.id}
                isFirst={index === 0}
                isLast={index === items.length - 1}
                onSelect={() => onSelect(s.id)}
                onDeleted={() => onDeleted(s.id)}
              />
            ))}
          </Stack>
        </Accordion.ItemBody>
      </Accordion.ItemContent>
    </Accordion.Item>
  );
}
