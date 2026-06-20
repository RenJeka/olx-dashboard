import { HStack, Spinner, Text } from '@chakra-ui/react';
import {
  DialogBackdrop,
  DialogBody,
  DialogCloseTrigger,
  DialogContent,
  DialogHeader,
  DialogRoot,
  DialogTitle,
} from '../../ui/dialog';
import { useAiPicksFlow } from '../../../hooks/useAiPicksFlow';
import { AiPicksIdleStep } from './AiPicksIdleStep';
import { AiPicksResultStep } from './AiPicksResultStep';
import type { Search } from '../../../types';

interface Props {
  search: Search;
  open: boolean;
  onClose: () => void;
}

export function AiPicksDialog({ search, open, onClose }: Props) {
  const flow = useAiPicksFlow(search);

  return (
    <DialogRoot
      open={open}
      onOpenChange={(d) => {
        if (!d.open) {
          onClose();
          flow.reset();
        }
      }}
      size="lg"
      placement="center"
      scrollBehavior="inside"
    >
      <DialogBackdrop />
      <DialogContent>
        <DialogCloseTrigger />
        <DialogHeader>
          <DialogTitle>AI Вибір — {search.name}</DialogTitle>
        </DialogHeader>
        <DialogBody pb={6}>
          {flow.step === 'idle' && <AiPicksIdleStep flow={flow} />}

          {flow.step === 'running' && (
            <HStack gap={3} p={4} justify="center">
              <Spinner color="teal.500" />
              <Text>Аналізую {flow.promptCount} оголошень…</Text>
            </HStack>
          )}

          {flow.step === 'done' && (
            <AiPicksResultStep
              flow={flow}
              onCommit={() => flow.handleCommit(onClose)}
            />
          )}
        </DialogBody>
      </DialogContent>
    </DialogRoot>
  );
}
