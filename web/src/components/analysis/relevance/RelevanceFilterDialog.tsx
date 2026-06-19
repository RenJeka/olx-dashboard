import { Button } from '@chakra-ui/react';
import { LuScanSearch } from 'react-icons/lu';
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
import { useRelevanceFlow, UseRelevanceFlowProps } from '../../../hooks/useRelevanceFlow';
import { RelevanceSetupForm } from './RelevanceSetupForm';
import { RelevanceResultsList } from './RelevanceResultsList';

/**
 * Головний компонент діалогу AI-фільтрації релевантності.
 * Керує станом через useRelevanceFlow та відображає форму налаштування або результати.
 */
export function RelevanceFilterDialog({ search, selectedIds }: UseRelevanceFlowProps) {
  const flow = useRelevanceFlow({ search, selectedIds });
  const { state, actions } = flow;

  return (
    <DialogRoot
      open={state.open}
      onOpenChange={(d) => actions.setOpen(d.open)}
      size="lg"
      placement="center"
      scrollBehavior="inside"
    >
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" colorPalette="cyan">
          <LuScanSearch /> AI Фільтр
        </Button>
      </DialogTrigger>
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
