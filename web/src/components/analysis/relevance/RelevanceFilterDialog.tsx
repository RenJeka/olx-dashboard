import {
  DialogBackdrop,
  DialogBody,
  DialogCloseTrigger,
  DialogContent,
  DialogHeader,
  DialogRoot,
  DialogTitle,
} from '../../ui/dialog';
import { useRelevanceFlow, UseRelevanceFlowProps } from '../../../hooks/useRelevanceFlow';
import { RelevanceSetupForm } from './RelevanceSetupForm';
import { RelevanceResultsList } from './RelevanceResultsList';

/**
 * Головний компонент діалогу AI-фільтрації релевантності.
 * Керує станом через useRelevanceFlow та відображає форму налаштування або результати.
 */
export function RelevanceFilterDialog({ search, selectedIds, open, onClose }: UseRelevanceFlowProps) {
  const flow = useRelevanceFlow({ search, selectedIds, open, onClose });
  const { state } = flow;

  return (
    <DialogRoot
      open={open}
      onOpenChange={(d) => {
        if (!d.open) onClose();
      }}
      size="lg"
      placement="center"
      scrollBehavior="inside"
    >
      <DialogBackdrop />
      <DialogContent>
        <DialogCloseTrigger />
        <DialogHeader>
          <DialogTitle>AI Фільтр релевантності — {search.name}</DialogTitle>
        </DialogHeader>
        <DialogBody pb={6}>
          {state.step !== 'done' ? (
            <RelevanceSetupForm flow={flow} />
          ) : (
            <RelevanceResultsList flow={flow} />
          )}
        </DialogBody>
      </DialogContent>
    </DialogRoot>
  );
}
