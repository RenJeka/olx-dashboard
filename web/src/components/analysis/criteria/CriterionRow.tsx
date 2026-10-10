import { Badge, HStack, IconButton, Stack, Text, Wrap } from '@chakra-ui/react';
import { LuPencil, LuPlus, LuTrash2, LuX } from 'react-icons/lu';
import { Checkbox } from '../../ui/checkbox';
import { Switch } from '../../ui/switch';
import { Tooltip } from '../../ui/tooltip';
import type { CriterionRowData } from '../../../hooks/analysis/useCriteriaManager';

interface Props {
  row: CriterionRowData;
  colorPalette: string;
  checked: boolean;
  onCheck: () => void;
  busy: boolean;
  onToggleEnabled: () => void;
  onRename: () => void;
  onDelete: () => void;
  onDetachAlias: (alias: string) => void;
  /** Лише для пункту «лише в оголошеннях»: додати як категорію. */
  onAdd: () => void;
}

/** Рядок вікна «Критерії пошуку»: категорія з синонімами або пункт, що є лише в оголошеннях. */
export function CriterionRow({
  row,
  colorPalette,
  checked,
  onCheck,
  busy,
  onToggleEnabled,
  onRename,
  onDelete,
  onDetachAlias,
  onAdd,
}: Props) {
  const { group } = row;
  return (
    <Stack
      gap={1}
      py={2}
      px={2}
      borderBottomWidth="1px"
      borderColor="border.subtle"
      bg={checked ? 'colorPalette.subtle' : undefined}
      colorPalette={colorPalette}
    >
      <HStack gap={2} align="center">
        <Checkbox checked={checked} onCheckedChange={onCheck} aria-label={`Обрати «${row.name}»`} />
        {group && (
          <Tooltip content={group.enabled ? 'В аналізі — вимкнути' : 'Не в аналізі — увімкнути'} openDelay={300}>
            <Switch size="sm" checked={group.enabled} disabled={busy} onCheckedChange={onToggleEnabled} />
          </Tooltip>
        )}
        <Text
          flex="1"
          minW={0}
          textStyle="sm"
          fontWeight={group ? 'medium' : 'normal'}
          color={group && !group.enabled ? 'fg.muted' : undefined}
          lineClamp={2}
        >
          {row.name}
        </Text>
        <Text textStyle="xs" color="fg.muted" flexShrink={0}>
          у {row.count} огол.
        </Text>
        {group ? (
          <>
            <IconButton size="2xs" variant="ghost" aria-label="Перейменувати" disabled={busy} onClick={onRename}>
              <LuPencil />
            </IconButton>
            <IconButton size="2xs" variant="ghost" aria-label="Видалити" disabled={busy} onClick={onDelete}>
              <LuTrash2 />
            </IconButton>
          </>
        ) : (
          <Tooltip content="Додати в список критеріїв" openDelay={300}>
            <IconButton size="2xs" variant="ghost" aria-label="Додати в список" disabled={busy} onClick={onAdd}>
              <LuPlus />
            </IconButton>
          </Tooltip>
        )}
      </HStack>
      {group && group.aliases.length > 0 && (
        <Wrap gap={1} pl={8}>
          {group.aliases.map((a) => (
            <Badge key={a} variant="outline" size="sm" gap={0.5}>
              {a}
              <Tooltip content="Вийняти з категорії" openDelay={300}>
                <IconButton
                  size="2xs"
                  variant="ghost"
                  minW={4}
                  h={4}
                  aria-label={`Вийняти «${a}» з категорії`}
                  disabled={busy}
                  onClick={() => onDetachAlias(a)}
                >
                  <LuX />
                </IconButton>
              </Tooltip>
            </Badge>
          ))}
        </Wrap>
      )}
    </Stack>
  );
}
