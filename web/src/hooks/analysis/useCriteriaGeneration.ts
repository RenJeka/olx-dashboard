import { useState } from 'react';
import { useGenerateCriteria, fetchCriteriaPrompt, useImportCriteria } from '../../api';
import { useSettingsStore } from '../../stores/settingsStore';
import { showErrorToast } from '../../utils/toast';
import { toaster } from '../../components/ui/toaster';
import type { AnalysisMode, PackagePart } from '../../types';

/**
 * Генерація критеріїв: авто (LLM), ручний помічник (промпт → вставка відповіді). Спільне для кроку 1
 * майстра й діалогу «Критерії пошуку». Що робити зі згенерованим — вирішує `onIncoming`
 * (повертає, скільки справді нових — для тосту).
 */
export function useCriteriaGeneration(
  searchId: number,
  mode: AnalysisMode,
  onIncoming: (criteria: string[]) => number | Promise<number>,
) {
  const [showAssistant, setShowAssistant] = useState(false);
  const [parts, setParts] = useState<PackagePart[]>([]);

  const generateCriteria = useGenerateCriteria();
  const importCriteria = useImportCriteria();

  async function report(title: string, criteria: string[]) {
    const added = await onIncoming(criteria);
    const absorbed = criteria.length - added;
    toaster.create({
      type: 'success',
      title: `${title}: ${criteria.length}`,
      description: absorbed > 0 ? `Нових: ${added}; ${absorbed} збіглися з наявними категоріями` : undefined,
    });
  }

  async function handleGenerate() {
    const { analysisModel: model, analysisReasoning: reasoning, analysisExtraCriteria: extra } =
      useSettingsStore.getState();
    try {
      const { criteria } = await generateCriteria.mutateAsync({ searchId, mode, model, reasoning, extra });
      await report('Згенеровано критеріїв', criteria);
    } catch (err) {
      showErrorToast('Помилка генерації', err);
    }
  }

  async function openAssistant() {
    setShowAssistant(true);
    try {
      const { prompt } = await fetchCriteriaPrompt(searchId, mode, useSettingsStore.getState().analysisExtraCriteria);
      setParts([{ name: `критерії-${mode}.txt`, content: prompt }]);
    } catch (err) {
      showErrorToast('Не вдалося підготувати промпт', err);
    }
  }

  function handleImport(raw: string) {
    importCriteria.mutate(
      { searchId, mode, raw },
      {
        onSuccess: ({ criteria }) => void report('Розпізнано критеріїв', criteria),
        onError: (err) => showErrorToast('Помилка розбору', err),
      },
    );
  }

  return {
    handleGenerate,
    generatePending: generateCriteria.isPending,
    showAssistant,
    setShowAssistant,
    openAssistant,
    assistantParts: parts,
    handleImport,
    importPending: importCriteria.isPending,
  };
}
