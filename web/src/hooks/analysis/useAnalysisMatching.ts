import { useState } from 'react';
import { useAnalysisWizardStore } from '../../stores/analysisWizardStore';
import { useAnalyze, fetchAnalyzePackageZip, useImportAnalysis } from '../../api';
import { useSettingsStore } from '../../stores/settingsStore';
import { showErrorToast } from '../../utils/toast';
import { toaster } from '../../components/ui/toaster';
import { chunk } from '../../utils/array';
import { ANALYZE_CHUNK } from '../../constants';
import type { AnalyzedListing } from '../../types';

/**
 * Логіка кроку 2 (Пошук/Аналіз): запуск LLM-аналізу за обраними критеріями.
 * Підтримує автоматичний аналіз (через API) та генерацію ZIP-пакету для 
 * ручного виконання (напр., через Claude) з подальшим імпортом результатів.
 */
export function useAnalysisMatching(searchId: number, effectiveIds: number[]) {
  const { mode, accumulated, setAccumulated, setStep } = useAnalysisWizardStore();

  const [showMatchAssistant, setShowMatchAssistant] = useState(false);
  const [zipDownloading, setZipDownloading] = useState(false);
  const [analyzeProgress, setAnalyzeProgress] = useState<{ done: number; total: number } | null>(null);

  const analyze = useAnalyze();
  const importAnalysis = useImportAnalysis();

  const model = useSettingsStore.getState().analysisModel;
  const reasoning = useSettingsStore.getState().analysisReasoning;

  async function runAutoAnalyze() {
    if (effectiveIds.length === 0) {
      toaster.create({ type: 'error', title: 'Немає оголошень для аналізу' });
      return;
    }
    const chunks = chunk(effectiveIds, ANALYZE_CHUNK);
    setAnalyzeProgress({ done: 0, total: effectiveIds.length });
    let acc: AnalyzedListing[] = [];
    const errors: string[] = [];
    try {
      let done = 0;
      for (const ids of chunks) {
        const res = await analyze.mutateAsync({ searchId, mode, ids, model, reasoning });
        acc = [...acc, ...res.results];
        errors.push(...res.errors);
        done += ids.length;
        setAnalyzeProgress({ done, total: effectiveIds.length });
      }
      setAccumulated(acc);
      if (errors.length > 0) {
        toaster.create({
          type: 'warning',
          title: `Аналіз завершено з ${errors.length} помилками батчів`,
          description: errors[0],
        });
      }
      setStep(3);
    } catch (err) {
      showErrorToast('Помилка аналізу', err);
    } finally {
      setAnalyzeProgress(null);
    }
  }

  async function downloadZipPackage() {
    if (effectiveIds.length === 0) {
      toaster.create({ type: 'error', title: 'Немає оголошень для аналізу' });
      return;
    }
    setZipDownloading(true);
    try {
      await fetchAnalyzePackageZip(searchId, mode, effectiveIds);
      setShowMatchAssistant(true);
    } catch (err) {
      showErrorToast('Не вдалося підготувати ZIP-пакет', err);
    } finally {
      setZipDownloading(false);
    }
  }

  function handleImportMatching(raw: string) {
    importAnalysis.mutate(
      { searchId, mode, raw, accumulated },
      {
        onSuccess: (res) => {
          setAccumulated(res.results);
          toaster.create({
            type: 'success',
            title: `Опрацьовано оголошень: ${res.results.length}`,
          });
        },
        onError: (err) => showErrorToast('Помилка розбору', err),
      },
    );
  }

  return {
    showMatchAssistant,
    zipDownloading,
    analyzeProgress,
    runAutoAnalyze,
    downloadZipPackage,
    handleImportMatching,
    importAnalysisIsPending: importAnalysis.isPending,
  };
}
