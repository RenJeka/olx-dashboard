import { useEffect } from 'react';
import { useAnalysisWizardStore } from '../../../stores/analysisWizardStore';
import { Stack } from '@chakra-ui/react';
import {
  DialogBackdrop,
  DialogBody,
  DialogCloseTrigger,
  DialogContent,
  DialogHeader,
  DialogRoot,
  DialogTitle,
} from '../../ui/dialog';
import { ConfirmActionDialog } from '../../ConfirmActionDialog';
import { DescriptionDialog } from '../../DescriptionDialog';
import { useIsMobile } from '../../../hooks/useIsMobile';
import { useWizard } from '../../../hooks/analysis/useWizard';
import { WizardStepper } from './WizardStepper';
import { CriteriaStep } from './CriteriaStep';
import { MatchingStep } from './MatchingStep';
import { ReviewStep } from './ReviewStep';
import { CommitStep } from './CommitStep';
import type { Search } from '../../../types';

interface Props {
  search: Search;
  /** Id вибраних рядків (чекбокси) — для режиму «вибрані». */
  selectedIds: number[];
  open: boolean;
  onClose: () => void;
}

export function AnalysisWizardDialog({ search, selectedIds, open, onClose }: Props) {
  const isMobile = useIsMobile();
  const w = useWizard(search, selectedIds, open);

  // Завантажуємо критерії лише при першому відкритті або зміні режиму на кроці 1.
  useEffect(() => {
    if (!open || !w.savedCriteria) return;
    if (w.step !== 1 || w.mode === w.criteriaLoadedMode) return;
    const saved = w.savedCriteria[w.mode] ?? [];
    w.setStep(1); // ensure we stay on step 1 during load
    // Apply saved criteria
    useAnalysisWizardStore.getState().setAvailable(saved);
    useAnalysisWizardStore.getState().setSelected(new Set(saved));
    w.setCriteriaLoadedMode(w.mode);
  }, [open, w.mode, w.savedCriteria, w.step, w.criteriaLoadedMode]);

  // Прив'язуємо стан майстра до пошуку при кожному відкритті діалогу.
  useEffect(() => {
    if (!open) return;
    const prevBound = useAnalysisWizardStore.getState().boundSearchId;
    w.bindSearch(search.id);
    if (prevBound !== search.id) {
      w.setScope(w.computeDefaultScope());
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, search.id]);

  return (
    <DialogRoot
      open={open}
      onOpenChange={(d) => {
        if (!d.open) onClose();
      }}
      size={isMobile ? 'full' : 'xl'}
      placement="center"
      scrollBehavior="inside"
      closeOnInteractOutside={false}
    >
      <DialogBackdrop />
      <DialogContent>
        <DialogCloseTrigger />
        <DialogHeader>
          <Stack gap={3} w="full">
            <DialogTitle>AI-аналіз: {w.modeLabel}</DialogTitle>
            <WizardStepper
              step={w.step}
              modeLabel={w.modeLabel}
              scopeLabel={w.scopeLabel}
              effectiveCount={w.effectiveIds.length}
            />
          </Stack>
        </DialogHeader>

        <DialogBody pb={6}>
          {w.step === 1 && <CriteriaStep w={w} />}
          {w.step === 2 && <MatchingStep w={w} />}
          {w.step === 3 && <ReviewStep w={w} />}
          {w.step === 4 && <CommitStep w={w} onClose={onClose} />}
        </DialogBody>
      </DialogContent>

      <ConfirmActionDialog
        open={w.confirmOverwrite}
        onOpenChange={w.setConfirmOverwrite}
        title="Перезаписати наявні значення?"
        description={`У ${w.overwriteCount} оголошень поле «${w.modeLabel}» вже заповнене. Перезаписати результатами аналізу?`}
        confirmLabel="Перезаписати"
        onConfirm={() => void w.doCommit(onClose)}
      />
      <DescriptionDialog listing={w.openDescriptionListing} onClose={() => w.setOpenDescriptionListing(null)} />
    </DialogRoot>
  );
}
