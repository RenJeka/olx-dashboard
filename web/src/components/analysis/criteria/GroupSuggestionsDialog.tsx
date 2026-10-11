import { useState, type RefObject } from 'react';
import { Box, Button, HStack, Input, Stack, Text, Wrap } from '@chakra-ui/react';
import { Checkbox } from '../../ui/checkbox';
import { NestedDialog } from './NestedDialog';
import type { CriteriaMerge, GroupSuggestion } from '../../../types';

interface Props {
  portalRef: RefObject<HTMLElement | null>;
  /** «Мінуси» / «Плюси» — у заголовку. */
  modeLabel: string;
  suggestions: GroupSuggestion[];
  /** Скільки оголошень зачепить об'єднання цих критеріїв (назви + синоніми). */
  affectedCount: (names: string[]) => number;
  pending: boolean;
  onApply: (merges: CriteriaMerge[]) => void;
  onClose: () => void;
}

/** Стан однієї пропозиції у вікні: прийнята, назва (можна змінити), члени, що лишаються в групі. */
interface Draft {
  accepted: boolean;
  name: string;
  members: string[];
  kept: Set<string>;
}

/**
 * Пропозиції автогрупування (docs/plans/old/criteria-auto-group.md): прийняти групу чи ні, лишити окремі члени
 * окремими критеріями, змінити назву. Група з < 2 обраних членів вимикається сама.
 */
export function GroupSuggestionsDialog({ portalRef, modeLabel, suggestions, affectedCount, pending, onApply, onClose }: Props) {
  const [drafts, setDrafts] = useState<Draft[]>(() =>
    suggestions.map((s) => ({ accepted: true, name: s.name, members: s.members, kept: new Set(s.members) })),
  );

  const chosenOf = (d: Draft) => d.members.filter((m) => d.kept.has(m));
  const isActive = (d: Draft) => d.accepted && chosenOf(d).length >= 2;
  const active = drafts.filter(isActive);
  const valid = active.every((d) => d.name.trim() !== '');

  function update(index: number, patch: (d: Draft) => Draft) {
    setDrafts((prev) => prev.map((d, i) => (i === index ? patch(d) : d)));
  }

  function toggleMember(index: number, member: string) {
    update(index, (d) => {
      const kept = new Set(d.kept);
      if (kept.has(member)) kept.delete(member);
      else kept.add(member);
      return { ...d, kept };
    });
  }

  return (
    <NestedDialog
      portalRef={portalRef}
      size="md"
      title={`Запропоновані категорії · ${modeLabel}`}
      onClose={onClose}
      footer={
        <>
          <Button variant="outline" size="sm" onClick={onClose}>
            Не об'єднувати
          </Button>
          <Button
            size="sm"
            colorPalette="accent"
            loading={pending}
            disabled={active.length === 0 || !valid}
            onClick={() => onApply(active.map((d) => ({ from: chosenOf(d), to: d.name.trim() })))}
          >
            Об'єднати обрані ({active.length})
          </Button>
        </>
      }
    >
      <Stack gap={4}>
        {drafts.map((d, i) => {
          const chosen = chosenOf(d);
          const enough = chosen.length >= 2;
          return (
            <Stack key={d.members.join('|')} gap={2} opacity={isActive(d) ? 1 : 0.6}>
              <HStack gap={2}>
                <Checkbox
                  inputProps={{ 'aria-label': `Прийняти групу «${d.name}»` }}
                  checked={isActive(d)}
                  disabled={!enough}
                  onCheckedChange={() => update(i, (x) => ({ ...x, accepted: !x.accepted }))}
                />
                <Input
                  size="sm"
                  flex="1"
                  value={d.name}
                  disabled={!isActive(d)}
                  onChange={(e) => update(i, (x) => ({ ...x, name: e.target.value }))}
                />
                <Text textStyle="xs" color="fg.muted" whiteSpace="nowrap">
                  зачепить {enough ? affectedCount(chosen) : 0} огол.
                </Text>
              </HStack>
              <Box pl={7}>
                <Wrap gap={3}>
                  {d.members.map((m) => (
                    <Checkbox key={m} size="sm" checked={d.kept.has(m)} onCheckedChange={() => toggleMember(i, m)}>
                      {m}
                    </Checkbox>
                  ))}
                </Wrap>
              </Box>
            </Stack>
          );
        })}
        <Text textStyle="sm" color="fg.muted">
          Решта критеріїв лишаються окремими. Пункти в зачеплених оголошеннях перейменуються, AI не запускається.
        </Text>
      </Stack>
    </NestedDialog>
  );
}
