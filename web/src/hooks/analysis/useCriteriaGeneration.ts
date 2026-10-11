import { useState } from 'react';
import { useGenerateCriteria, fetchCriteriaPrompt, useImportCriteria } from '../../api';
import { useSettingsStore } from '../../stores/settingsStore';
import { showErrorToast } from '../../utils/toast';
import { toaster } from '../../components/ui/toaster';
import type { AnalysisMode, PackagePart } from '../../types';

/** Згенеровані/розпізнані критерії, що чекають рішення людини (діалог `NewCriteriaDialog`). */
export interface CriteriaCandidates {
  title: string;
  /** Справді нові — не збігаються з назвою чи синонімом наявної категорії. */
  fresh: string[];
  /** Скільки збіглися з наявними (не показуються). */
  absorbed: number;
}

interface Handlers {
  /** Які з формулювань справді нові (решту поглинають наявні категорії). */
  freshOf: (criteria: string[]) => string[];
  /** Додати обрані людиною. */
  onAdd: (phrases: string[]) => unknown;
}

/**
 * Генерація критеріїв: авто (LLM), ручний помічник (промпт → вставка відповіді). Спільне для кроку 1
 * майстра й вікна «Плюси та мінуси». Згенероване не додається одразу: нові формулювання йдуть у
 * `candidates` — людина обирає потрібні в `NewCriteriaDialog` (`addCandidates`) або закриває без змін.
 */
export function useCriteriaGeneration(searchId: number, mode: AnalysisMode, { freshOf, onAdd }: Handlers) {
  const [showAssistant, setShowAssistant] = useState(false);
  const [parts, setParts] = useState<PackagePart[]>([]);
  const [candidates, setCandidates] = useState<CriteriaCandidates | null>(null);
  const [addPending, setAddPending] = useState(false);

  const generateCriteria = useGenerateCriteria();
  const importCriteria = useImportCriteria();

  function offer(title: string, criteria: string[]) {
    const fresh = freshOf(criteria);
    const absorbed = criteria.length - fresh.length;
    if (fresh.length === 0) {
      toaster.create({
        type: 'info',
        title: `${title}: нових немає`,
        description: absorbed > 0 ? `Усі ${absorbed} збіглися з наявними категоріями` : undefined,
      });
      return;
    }
    setCandidates({ title, fresh, absorbed });
  }

  async function handleGenerate() {
    const { analysisModel: model, analysisReasoning: reasoning, analysisExtraCriteria: extra } =
      useSettingsStore.getState();
    try {
      const { criteria } = await generateCriteria.mutateAsync({ searchId, mode, model, reasoning, extra });
      offer('Згенеровано', criteria);
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
        onSuccess: ({ criteria }) => offer('Розпізнано', criteria),
        onError: (err) => showErrorToast('Помилка розбору', err),
      },
    );
  }

  async function addCandidates(phrases: string[]) {
    setAddPending(true);
    try {
      await onAdd(phrases);
      setCandidates(null);
      toaster.create({ type: 'success', title: `Додано критеріїв: ${phrases.length}` });
    } catch {
      // тост — у onAdd
    } finally {
      setAddPending(false);
    }
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
    candidates,
    addCandidates,
    addPending,
    dismissCandidates: () => setCandidates(null),
  };
}
