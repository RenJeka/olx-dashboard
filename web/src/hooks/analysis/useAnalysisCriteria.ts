import { useState } from 'react';
import { useAnalysisWizardStore } from '../../stores/analysisWizardStore';
import { useGenerateCriteria, fetchCriteriaPrompt, useImportCriteria, useSaveCriteria } from '../../api';
import { useSettingsStore } from '../../stores/settingsStore';
import { showErrorToast } from '../../utils/toast';
import { toaster } from '../../components/ui/toaster';
import type { AnalysisMode, PackagePart } from '../../types';

/**
 * Логіка кроку 1 (Критерії): управління списком критеріїв для AI-аналізу.
 * Дозволяє генерувати нові критерії через LLM, імпортувати з ручного режиму,
 * додавати власні та обирати потрібні для наступного кроку.
 */
export function useAnalysisCriteria(searchId: number) {
  const {
    mode, setMode,
    available, setAvailable,
    selected, setSelected,
    customInput, setCustomInput,
    setStep,
  } = useAnalysisWizardStore();

  const [showCriteriaAssistant, setShowCriteriaAssistant] = useState(false);
  const [criteriaParts, setCriteriaParts] = useState<PackagePart[]>([]);

  const generateCriteria = useGenerateCriteria();
  const importCriteria = useImportCriteria();
  const saveCriteria = useSaveCriteria();

  const model = useSettingsStore.getState().analysisModel;
  const reasoning = useSettingsStore.getState().analysisReasoning;
  const extra = useSettingsStore.getState().analysisExtraCriteria;

  function mergeCriteria(incoming: string[]) {
    setAvailable((prev) => {
      const set = new Set(prev.map((c) => c.toLowerCase()));
      const merged = [...prev];
      for (const c of incoming) {
        if (!set.has(c.toLowerCase())) {
          merged.push(c);
          set.add(c.toLowerCase());
        }
      }
      return merged;
    });
    setSelected((prev) => {
      const next = new Set(prev);
      for (const c of incoming) next.add(c);
      return next;
    });
  }

  function toggleCriterion(c: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(c)) next.delete(c);
      else next.add(c);
      return next;
    });
  }

  function addCustom() {
    const c = customInput.trim();
    if (!c) return;
    mergeCriteria([c]);
    setCustomInput('');
  }

  async function handleGenerateCriteria() {
    try {
      const { criteria } = await generateCriteria.mutateAsync({
        searchId,
        mode,
        model,
        reasoning,
        extra,
      });
      mergeCriteria(criteria);
      toaster.create({ type: 'success', title: `Згенеровано критеріїв: ${criteria.length}` });
    } catch (err) {
      showErrorToast('Помилка генерації', err);
    }
  }

  async function openCriteriaAssistant() {
    setShowCriteriaAssistant(true);
    try {
      const { prompt } = await fetchCriteriaPrompt(searchId, mode, extra);
      setCriteriaParts([{ name: `критерії-${mode}.txt`, content: prompt }]);
    } catch (err) {
      showErrorToast('Не вдалося підготувати промпт', err);
    }
  }

  function handleImportCriteria(raw: string) {
    importCriteria.mutate(
      { searchId, mode, raw },
      {
        onSuccess: ({ criteria }) => {
          mergeCriteria(criteria);
          toaster.create({ type: 'success', title: `Розпізнано критеріїв: ${criteria.length}` });
        },
        onError: (err) => showErrorToast('Помилка розбору', err),
      },
    );
  }

  async function goToMatching() {
    const chosen = available.filter((c) => selected.has(c));
    if (chosen.length === 0) {
      toaster.create({ type: 'error', title: 'Оберіть хоча б один критерій' });
      return;
    }
    try {
      await saveCriteria.mutateAsync(
        mode === 'cons' ? { searchId, cons: chosen } : { searchId, pros: chosen },
      );
      setStep(2);
    } catch (err) {
      showErrorToast('Не вдалося зберегти критерії', err);
    }
  }

  const chosenCount = available.filter((c) => selected.has(c)).length;

  return {
    showCriteriaAssistant, setShowCriteriaAssistant,
    criteriaParts,
    toggleCriterion, addCustom,
    handleGenerateCriteria,
    generateCriteriaIsPending: generateCriteria.isPending,
    openCriteriaAssistant,
    handleImportCriteria,
    importCriteriaIsPending: importCriteria.isPending,
    goToMatching,
    saveCriteriaIsPending: saveCriteria.isPending,
    chosenCount,
  };
}
