import { Button, HStack } from '@chakra-ui/react';
import { MODE_LABELS, MODE_PALETTE } from '../../constants';
import type { AnalysisMode } from '../../types';

interface Props {
  mode: AnalysisMode;
  onChange: (mode: AnalysisMode) => void;
}

/** Перемикач «Мінуси / Плюси» — крок 1 майстра й вікно «Плюси та мінуси». */
export function ModeToggle({ mode, onChange }: Props) {
  return (
    <HStack gap={1}>
      {(['cons', 'pros'] as const).map((m) => (
        <Button
          key={m}
          size="xs"
          colorPalette={MODE_PALETTE[m]}
          variant={mode === m ? 'solid' : 'outline'}
          onClick={() => onChange(m)}
        >
          {MODE_LABELS[m]}
        </Button>
      ))}
    </HStack>
  );
}
