import type { RefObject } from 'react';
import { Button, HStack, IconButton, Input, Stack } from '@chakra-ui/react';
import { LuPlus, LuWandSparkles } from 'react-icons/lu';
import { ManualAssistant } from '../ManualAssistant';
import { NewCriteriaDialog } from './NewCriteriaDialog';
import type { useCriteriaGeneration } from '../../../hooks/analysis/useCriteriaGeneration';

interface Props {
  value: string;
  onChange: (value: string) => void;
  onAdd: () => void;
  addDisabled?: boolean;
  /** «Згенерувати» (LLM) — лише коли є ключ API. */
  apiAvailable: boolean;
  generation: ReturnType<typeof useCriteriaGeneration>;
  /** Контент модалки, у якій стоїть панель, — для вікна вибору згенерованого поверх неї. */
  portalRef: RefObject<HTMLElement | null>;
}

/**
 * Додавання критеріїв: свій критерій, «Згенерувати» (LLM), «Згенерувати вручну» (помічник: промпт → вставка).
 * Спільне для кроку 1 майстра й вікна «Плюси та мінуси»; згенероване йде у вікно вибору (`NewCriteriaDialog`).
 */
export function CriteriaInputBar({ value, onChange, onAdd, addDisabled, apiAvailable, generation, portalRef }: Props) {
  return (
    <Stack gap={3}>
      <HStack gap={2}>
        <Input
          size="sm"
          placeholder="Додати свій критерій…"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && onAdd()}
        />
        <IconButton size="sm" variant="outline" aria-label="Додати" disabled={addDisabled} onClick={onAdd}>
          <LuPlus />
        </IconButton>
      </HStack>
      <HStack gap={2} wrap="wrap">
        {apiAvailable && (
          <Button
            size="sm"
            colorPalette="purple"
            onClick={() => void generation.handleGenerate()}
            loading={generation.generatePending}
          >
            <LuWandSparkles /> Згенерувати
          </Button>
        )}
        <Button size="sm" variant="outline" onClick={() => void generation.openAssistant()}>
          Згенерувати вручну
        </Button>
      </HStack>
      {generation.showAssistant && (
        <ManualAssistant
          title="Помічник: генерація критеріїв"
          parts={generation.assistantParts}
          pasteLabel="Розпізнати критерії"
          onSubmit={generation.handleImport}
          submitting={generation.importPending}
        />
      )}
      {generation.candidates && (
        <NewCriteriaDialog
          portalRef={portalRef}
          candidates={generation.candidates}
          pending={generation.addPending}
          onAdd={(phrases) => void generation.addCandidates(phrases)}
          onClose={generation.dismissCandidates}
        />
      )}
    </Stack>
  );
}
