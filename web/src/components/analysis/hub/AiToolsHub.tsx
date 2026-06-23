import { useState } from 'react';
import { Button } from '@chakra-ui/react';
import { LuSparkles } from 'react-icons/lu';
import { AiHubDialog } from './AiHubDialog';
import { RelevanceFilterDialog } from '../relevance/RelevanceFilterDialog';
import { AnalysisWizardDialog } from '../wizard/AnalysisWizardDialog';
import { AiPicksDialog } from '../ai-picks/AiPicksDialog';
import type { Search } from '../../../types';

export type AiHubMode = 'closed' | 'hub' | 'relevance' | 'analysis' | 'picks';

interface Props {
  search: Search;
  selectedIds: number[];
}

/**
 * Єдина точка входу в AI-інструменти з хедера: кнопка «AI» відкриває хаб із трьома
 * послідовними кроками workflow, клік по кроку закриває хаб і відкриває відповідний діалог.
 */
export function AiToolsHub({ search, selectedIds }: Props) {
  const [mode, setMode] = useState<AiHubMode>('closed');
  const close = () => setMode('closed');

  return (
    <>
      <Button size="sm" variant="outline" colorPalette="purple" onClick={() => setMode('hub')}>
        <LuSparkles /> AI
      </Button>

      <AiHubDialog search={search} open={mode === 'hub'} onClose={close} onSelect={setMode} />

      <RelevanceFilterDialog
        search={search}
        selectedIds={selectedIds}
        open={mode === 'relevance'}
        onClose={close}
      />
      <AnalysisWizardDialog
        search={search}
        selectedIds={selectedIds}
        open={mode === 'analysis'}
        onClose={close}
      />
      <AiPicksDialog search={search} open={mode === 'picks'} onClose={close} />
    </>
  );
}
