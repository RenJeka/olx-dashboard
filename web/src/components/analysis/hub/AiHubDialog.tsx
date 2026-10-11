import { Box, Stack } from '@chakra-ui/react';
import { LuListChecks, LuScanSearch, LuSparkles, LuTrophy } from 'react-icons/lu';
import {
  DialogBackdrop,
  DialogBody,
  DialogCloseTrigger,
  DialogContent,
  DialogHeader,
  DialogRoot,
  DialogTitle,
} from '../../ui/dialog';
import { AiHubStepCard } from './AiHubStepCard';
import type { Search } from '../../../types';
import type { AiHubMode } from './AiToolsHub';

interface Props {
  search: Search;
  open: boolean;
  onClose: () => void;
  onSelect: (mode: AiHubMode) => void;
  /** Хаб повністю закрився (після анімації). */
  onExitComplete?: () => void;
}

const STEPS = [
  {
    number: 1,
    mode: 'relevance' as AiHubMode,
    title: 'AI Фільтр релевантності',
    description: 'Видаляє з видачі оголошення, що не продають цільовий товар.',
    icon: LuScanSearch,
    colorPalette: 'cyan',
  },
  {
    number: 2,
    mode: 'analysis' as AiHubMode,
    title: 'AI Аналіз плюсів і мінусів',
    description: 'Аналізує переваги та недоліки кожного оголошення за вашими критеріями.',
    icon: LuSparkles,
    colorPalette: 'purple',
  },
  {
    number: 3,
    mode: 'picks' as AiHubMode,
    title: 'AI Вибір (топ-30)',
    description: 'Знаходить найкращі пропозиції серед усіх оголошень пошуку.',
    icon: LuTrophy,
    colorPalette: 'teal',
  },
];

/** Хаб AI-інструментів: 3 послідовних кроки workflow (фільтр → аналіз → вибір). */
export function AiHubDialog({ search, open, onClose, onSelect, onExitComplete }: Props) {
  return (
    <DialogRoot
      open={open}
      onExitComplete={onExitComplete}
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
          <DialogTitle>AI-інструменти — {search.name}</DialogTitle>
        </DialogHeader>
        <DialogBody pb={6}>
          <Stack gap={0}>
            {STEPS.map((step, i) => (
              <Stack key={step.mode} gap={0}>
                <AiHubStepCard
                  number={step.number}
                  title={step.title}
                  description={step.description}
                  icon={step.icon}
                  colorPalette={step.colorPalette}
                  onRun={() => onSelect(step.mode)}
                  secondary={
                    step.mode === 'analysis'
                      ? { label: 'Плюси та мінуси', icon: LuListChecks, onClick: () => onSelect('criteria') }
                      : undefined
                  }
                />
                {i < STEPS.length - 1 && (
                  <Box w="1px" h={4} bg="border.subtle" ml={7.5} />
                )}
              </Stack>
            ))}
          </Stack>
        </DialogBody>
      </DialogContent>
    </DialogRoot>
  );
}
