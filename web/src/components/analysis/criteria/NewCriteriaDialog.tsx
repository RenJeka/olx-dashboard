import { useState, type RefObject } from 'react';
import { Button, HStack, Stack, Text } from '@chakra-ui/react';
import {
  DialogBackdrop,
  DialogBody,
  DialogCloseTrigger,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogRoot,
  DialogTitle,
} from '../../ui/dialog';
import { Checkbox } from '../../ui/checkbox';
import { sortAlpha } from '../../../utils/sort';
import type { CriteriaCandidates } from '../../../hooks/analysis/useCriteriaGeneration';

interface Props {
  /** Контент нижньої модалки — рендер усередині неї (docs/instructions/chakra-nested-dialog-focus.md). */
  portalRef: RefObject<HTMLElement | null>;
  candidates: CriteriaCandidates;
  pending: boolean;
  onAdd: (phrases: string[]) => void;
  onClose: () => void;
}

/**
 * Згенеровані (LLM) чи розпізнані (ручний помічник) критерії — до додавання: обрати потрібні, додати обрані
 * або закрити без змін. Монтувати лише на час показу (Ark Portal читає portalRef при монтуванні).
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
    <DialogRoot
      open
      onOpenChange={(d) => !d.open && onClose()}
      size="md"
      placement="center"
      scrollBehavior="inside"
      // Поверх іншої модалки: modal=false + рендер у її DOM (portalRef); закриття — лише хрестиком/кнопкою.
      modal={false}
      closeOnInteractOutside={false}
    >
      <DialogBackdrop />
      <DialogContent portalRef={portalRef}>
        <DialogCloseTrigger />
        <DialogHeader>
          <DialogTitle>
            {candidates.title}: нових {phrases.length}
          </DialogTitle>
        </DialogHeader>
        <DialogBody>
          <Stack gap={2}>
            {candidates.absorbed > 0 && (
              <Text textStyle="sm" color="fg.muted">
                Ще {candidates.absorbed} збіглися з наявними назвами чи синонімами — їх не показано.
              </Text>
            )}
            <HStack>
              <Button
                size="xs"
                variant="ghost"
                onClick={() => setChosen(allChosen ? new Set() : new Set(phrases))}
              >
                {allChosen ? 'Зняти всі' : 'Обрати всі'}
              </Button>
            </HStack>
            {phrases.map((p) => (
              <Checkbox key={p} checked={chosen.has(p)} onCheckedChange={() => toggle(p)}>
                {p}
              </Checkbox>
            ))}
          </Stack>
        </DialogBody>
        <DialogFooter>
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
        </DialogFooter>
      </DialogContent>
    </DialogRoot>
  );
}
