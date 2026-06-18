import { useState } from 'react';
import { Button, HStack, Spinner, Text } from '@chakra-ui/react';
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
import { useAiPicksFlow } from '../../../hooks/useAiPicksFlow';
import { AiPicksIdleStep } from './AiPicksIdleStep';
import { AiPicksResultStep } from './AiPicksResultStep';
import type { Search } from '../../../types';

interface Props {
  search: Search;
}

export function AiPicksDialog({ search }: Props) {
  const [open, setOpen] = useState(false);
  const flow = useAiPicksFlow(search);

  return (
    <DialogRoot
      open={open}
      onOpenChange={(d) => {
        setOpen(d.open);
        if (!d.open) flow.reset();
      }}
      size="lg"
      placement="center"
      scrollBehavior="inside"
    >
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" colorPalette="teal">
          <LuSparkles /> AI Вибір
        </Button>
      </DialogTrigger>
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
              onCommit={() => flow.handleCommit(() => setOpen(false))}
            />
          )}
        </DialogBody>
      </DialogContent>
    </DialogRoot>
  );
}
