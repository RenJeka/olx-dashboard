import type { ReactNode } from 'react';
import { Box, Text } from '@chakra-ui/react';
import { CriterionRow } from './CriterionRow';
import type { CriterionRowData, useCriteriaManager } from '../../../hooks/analysis/useCriteriaManager';

interface Props {
  m: ReturnType<typeof useCriteriaManager>;
  colorPalette: string;
  busy: boolean;
  onRename: (name: string) => void;
  onDelete: (name: string) => void;
}

/**
 * Список вікна «Плюси та мінуси» розділами: категорії (з синонімами) → окремі критерії → пункти, що є лише
 * в оголошеннях. Кожен розділ — за алфавітом (`categoriesFirst`, `useCriteriaManager`).
 */
export function CriteriaList({ m, colorPalette, busy, onRename, onDelete }: Props) {
  const { categories, singles, orphans } = m.rows;

  const row = (r: CriterionRowData, actions: Partial<Parameters<typeof CriterionRow>[0]>) => (
    <CriterionRow
      key={`${r.group ? 'g' : 'o'}:${r.name}`}
      row={r}
      colorPalette={colorPalette}
      checked={m.selected.has(r.name)}
      onCheck={() => m.toggleSelected(r.name)}
      busy={busy}
      {...actions}
    />
  );
  const listed = (r: CriterionRowData) =>
    row(r, {
      onToggleEnabled: () => m.toggleEnabled(r.name),
      onRename: () => onRename(r.name),
      onDelete: () => onDelete(r.name),
      onDetachAlias: (alias) => m.detachAlias(r.name, alias),
    });

  return (
    <Box borderTopWidth="1px" borderColor="border.subtle">
      {categories.length + singles.length + orphans.length === 0 && (
        <Text textStyle="sm" color="fg.muted" py={3}>
          {m.filter ? 'Нічого не знайдено.' : 'Критеріїв ще немає — згенеруй або додай вручну.'}
        </Text>
      )}
      {categories.length > 0 && <SectionLabel>Категорії (з синонімами)</SectionLabel>}
      {categories.map(listed)}
      {categories.length > 0 && singles.length > 0 && <SectionLabel>Окремі критерії</SectionLabel>}
      {singles.map(listed)}
      {orphans.length > 0 && (
        <SectionLabel>Лише в оголошеннях (не в списку критеріїв): старі прогони або ручні правки</SectionLabel>
      )}
      {orphans.map((r) => row(r, { onAdd: () => void m.addPhrases([r.name]).catch(() => {}) }))}
    </Box>
  );
}

function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <Text textStyle="xs" color="fg.muted" fontWeight="semibold" pt={3} pb={1}>
      {children}
    </Text>
  );
}
