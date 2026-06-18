import { useEffect, useState } from 'react';
import { useAnalysisWizardStore } from '../../../stores/analysisWizardStore';
import { Button, Stack } from '@chakra-ui/react';
import { LuSparkles } from 'react-icons/lu';
import {
  DialogBackdrop,
  DialogBody,
  DialogCloseTrigger,
  DialogContent,
  DialogHeader,
  DialogRoot,
  DialogTitle,
  DialogTrigger,
} from '../../ui/dialog';
import { ConfirmActionDialog } from '../../ConfirmActionDialog';
import { DescriptionDialog } from '../../DescriptionDialog';
import { useIsMobile } from '../../../hooks/useIsMobile';
import { useWizardActions } from '../../../hooks/useWizardActions';
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
}

export function AnalysisWizardDialog({ search, selectedIds }: Props) {
  const isMobile = useIsMobile();
  const [open, setOpen] = useState(false);
  const w = useWizardActions(search, selectedIds, open);

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

  return (
    <DialogRoot
      open={open}
      onOpenChange={(d) => {
        setOpen(d.open);
        if (d.open) {
          const prevBound = useAnalysisWizardStore.getState().boundSearchId;
          w.bindSearch(search.id);
          if (prevBound !== search.id) {
            w.setScope(w.computeDefaultScope());
          }
        }
      }}
      size={isMobile ? 'full' : 'xl'}
      placement="center"
      scrollBehavior="inside"
      closeOnInteractOutside={false}
    >
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" colorPalette="purple">
          <LuSparkles /> AI
        </Button>
      </DialogTrigger>
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
          {w.step === 4 && <CommitStep w={w} onClose={() => setOpen(false)} />}
        </DialogBody>
      </DialogContent>

      <ConfirmActionDialog
        open={w.confirmOverwrite}
        onOpenChange={w.setConfirmOverwrite}
        title="Перезаписати наявні значення?"
        description={`У ${w.overwriteCount} оголошень поле «${w.modeLabel}» вже заповнене. Перезаписати результатами аналізу?`}
        confirmLabel="Перезаписати"
        onConfirm={() => void w.doCommit(() => setOpen(false))}
      />
      <DescriptionDialog listing={w.openDescriptionListing} onClose={() => w.setOpenDescriptionListing(null)} />
    </DialogRoot>
  );
}
