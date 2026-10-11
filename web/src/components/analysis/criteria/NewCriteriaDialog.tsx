import { useState, type RefObject } from 'react';
import { Button, Stack, Text } from '@chakra-ui/react';
import { Checkbox } from '../../ui/checkbox';
import { sortAlpha } from '../../../utils/sort';
import { NestedDialog } from './NestedDialog';
import type { CriteriaCandidates } from '../../../hooks/analysis/useCriteriaGeneration';

interface Props {
  portalRef: RefObject<HTMLElement | null>;
  candidates: CriteriaCandidates;
  pending: boolean;
  onAdd: (phrases: string[]) => void;
  onClose: () => void;
}

/**
 * Згенеровані (LLM) чи розпізнані (ручний помічник) критерії — до додавання: обрати потрібні, додати обрані
 * або закрити без змін.
 */
export function NewCriteriaDialog({ portalRef, candidates, pending, onAdd, onClose }: Props) {
  const phrases = sortAlpha(candidates.fresh);
  const [chosen, setChosen] = useState<Set<string>>(() => new Set(phrases));
  const allChosen = chosen.size === phrases.length;

  function toggle(p: string) {
    setChosen((prev) => {
      const next = new Set(prev);
      if (next.has(p)) next.delete(p);
      else next.add(p);
      return next;
    });
  }

  return (
    <NestedDialog
      portalRef={portalRef}
      size="md"
      title={`${candidates.title}: нових ${phrases.length}`}
      onClose={onClose}
      footer={
        <>
          <Button variant="outline" size="sm" onClick={onClose}>
            Не додавати
          </Button>
          <Button
            size="sm"
            colorPalette="accent"
            loading={pending}
            disabled={chosen.size === 0}
            onClick={() => onAdd(phrases.filter((p) => chosen.has(p)))}
          >
            Додати обрані ({chosen.size})
          </Button>
        </>
      }
    >
      <Stack gap={2} align="flex-start">
        {candidates.absorbed > 0 && (
          <Text textStyle="sm" color="fg.muted">
            Ще {candidates.absorbed} збіглися з наявними назвами чи синонімами — їх не показано.
          </Text>
        )}
        <Button size="xs" variant="ghost" onClick={() => setChosen(allChosen ? new Set() : new Set(phrases))}>
          {allChosen ? 'Зняти всі' : 'Обрати всі'}
        </Button>
        {phrases.map((p) => (
          <Checkbox key={p} checked={chosen.has(p)} onCheckedChange={() => toggle(p)}>
            {p}
          </Checkbox>
        ))}
      </Stack>
    </NestedDialog>
  );
}
