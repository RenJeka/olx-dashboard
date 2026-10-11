import { useState } from 'react';
import { Button } from '@chakra-ui/react';
import { LuSparkles } from 'react-icons/lu';
import { AiHubDialog } from './AiHubDialog';
import { RelevanceFilterDialog } from '../relevance/RelevanceFilterDialog';
import { AnalysisWizardDialog } from '../wizard/AnalysisWizardDialog';
import { AiPicksDialog } from '../ai-picks/AiPicksDialog';
import { CriteriaManagerDialog } from '../criteria/CriteriaManagerDialog';
import type { Search } from '../../../types';

export type AiHubMode = 'closed' | 'hub' | 'relevance' | 'analysis' | 'picks' | 'criteria';

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
  // Вікно «Плюси та мінуси» монтується лише відкритим, тож відкриваємо його ПІСЛЯ закриття хабу: змонтоване,
  // поки хаб ще закривається, Ark закриває разом із ним (вкладений шар dismissable-стеку).
  const [afterHub, setAfterHub] = useState<AiHubMode | null>(null);
  function select(next: AiHubMode) {
    if (next !== 'criteria') return setMode(next);
    setAfterHub(next);
    setMode('closed');
  }

  return (
    <>
      <Button size="sm" variant="outline" colorPalette="purple" onClick={() => setMode('hub')}>
        <LuSparkles /> AI
      </Button>

      <AiHubDialog
        search={search}
        open={mode === 'hub'}
        onClose={close}
        onSelect={select}
        onExitComplete={() => {
          if (afterHub) setMode(afterHub);
          setAfterHub(null);
        }}
      />

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
      <AiPicksDialog
        search={search}
        selectedIds={selectedIds}
        open={mode === 'picks'}
        onClose={close}
      />
      {/* Монтується лише відкритим: режим і запити вікна беруться при монтуванні. */}
      {mode === 'criteria' && <CriteriaManagerDialog search={search} onClose={close} />}
    </>
  );
}
