import type { ReactNode, RefObject } from 'react';
import { Button, HStack, IconButton, Input, Stack } from '@chakra-ui/react';
import { LuPlus, LuWandSparkles } from 'react-icons/lu';
import { ManualAssistant } from '../ManualAssistant';
import { NewCriteriaDialog } from './NewCriteriaDialog';
import type { CriteriaGenerationModel } from '../../../hooks/analysis/useCriteriaGeneration';

interface Props {
  value: string;
  onChange: (value: string) => void;
  onAdd: () => void;
  addDisabled?: boolean;
  /** «Згенерувати» (LLM) — лише коли є ключ API. */
  apiAvailable: boolean;
  generation: CriteriaGenerationModel;
  /** Контент модалки, у якій стоїть панель, — для вікна вибору згенерованого поверх неї. */
  portalRef: RefObject<HTMLElement | null>;
  /** Додаткові кнопки в ряд із «Згенерувати» (вікно «Плюси та мінуси» — «Згрупувати автоматично»). */
  extraActions?: ReactNode;
}

/**
 * Додавання критеріїв: свій критерій, «Згенерувати» (LLM), «Згенерувати вручну» (помічник: промпт → вставка).
 * Спільне для кроку 1 майстра, вікна «Плюси та мінуси» і «Базові плюси й мінуси» (там без помічника);
 * згенероване йде у вікно вибору (`NewCriteriaDialog`).
 */
export function CriteriaInputBar({
  value,
  onChange,
  onAdd,
  addDisabled,
  apiAvailable,
  generation,
  portalRef,
  extraActions,
}: Props) {
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
        {generation.openAssistant && (
          <Button size="sm" variant="outline" onClick={() => void generation.openAssistant?.()}>
            Згенерувати вручну
          </Button>
        )}
        {extraActions}
      </HStack>
      {generation.showAssistant && generation.handleImport && (
        <ManualAssistant
          title="Помічник: генерація критеріїв"
          parts={generation.assistantParts ?? []}
          pasteLabel="Розпізнати критерії"
          onSubmit={generation.handleImport}
          submitting={generation.importPending ?? false}
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
