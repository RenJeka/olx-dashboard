import { useState } from 'react';
import { useAnalysisWizardStore } from '../../stores/analysisWizardStore';
import { useCommitAnalysis } from '../../api';
import { loadAnalysisModel } from '../../utils/storage';
import { showErrorToast } from '../../utils/toast';
import { toaster } from '../../components/ui/toaster';
import { chunk } from '../../utils/array';
import { COMMIT_CHUNK, MANUAL_MODEL, ANALYSIS_SOURCE } from '../../constants';
import type { CommitItem } from '../../types';

/**
 * Логіка кроку 4 (Запис): збереження верифікованих результатів аналізу в БД.
 * Керує режимом злиття (додавання до наявних або повний перезапис),
 * розбиває запис на чанки та відображає прогрес-бар.
 */
export function useAnalysisCommit(
  searchId: number,
  commitItems: CommitItem[],
  overwriteCount: number,
  apiAvailable: boolean
) {
  const { mode, reset } = useAnalysisWizardStore();

  const [confirmOverwrite, setConfirmOverwrite] = useState(false);
  const [commitProgress, setCommitProgress] = useState<{ done: number; total: number } | null>(null);
  const [mergeMode, setMergeMode] = useState<'append' | 'replace'>('append');

  const commit = useCommitAnalysis();
  const model = loadAnalysisModel();

  async function doCommit(closeDialog: () => void) {
    setCommitProgress({ done: 0, total: commitItems.length });
    try {
      let done = 0;
      for (const batch of chunk(commitItems, COMMIT_CHUNK)) {
        await commit.mutateAsync({
          searchId,
          mode,
          items: batch,
          model: apiAvailable ? model : MANUAL_MODEL,
          source: apiAvailable ? ANALYSIS_SOURCE.API : ANALYSIS_SOURCE.IMPORT,
          merge: mergeMode,
        });
        done += batch.length;
        setCommitProgress({ done, total: commitItems.length });
      }
      toaster.create({
        type: 'success',
        title: `Записано в таблицю: ${commitItems.length}`,
      });
      reset();
      closeDialog();
    } catch (err) {
      showErrorToast('Помилка запису', err);
    } finally {
      setCommitProgress(null);
    }
  }

  function handleCommitClick(closeDialog: () => void) {
    if (commitItems.length === 0) {
      toaster.create({ type: 'error', title: 'Немає результатів для запису' });
      return;
    }
    if (mergeMode === 'replace' && overwriteCount > 0) setConfirmOverwrite(true);
    else void doCommit(closeDialog);
  }

  return {
    confirmOverwrite, setConfirmOverwrite,
    commitProgress,
    mergeMode, setMergeMode,
    doCommit,
    handleCommitClick,
  };
}
