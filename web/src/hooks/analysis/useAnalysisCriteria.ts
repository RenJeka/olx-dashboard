import { useAnalysisWizardStore } from '../../stores/analysisWizardStore';
import { useSaveCriteria } from '../../api';
import { showErrorToast } from '../../utils/toast';
import { toaster } from '../../components/ui/toaster';
import { absorbIncoming, aliasLookup, phraseKey } from '../../utils/criteria';
import { useCriteriaGeneration } from './useCriteriaGeneration';
import type { CriteriaConfig, CriterionGroup } from '../../types';

/**
 * Логіка кроку 1 (Критерії): чипи = категорії пошуку (docs/plans/criteria-categories.md); обраний чип =
 * категорія «в аналізі». Генерація/імпорт — спільний хук: нові формулювання спершу показуються в
 * `NewCriteriaDialog`, збіги з назвою чи синонімом поглинаються наявною категорією. «Далі» зберігає позначки й нові категорії, нічого не видаляючи.
 */
export function useAnalysisCriteria(searchId: number, savedCriteria: CriteriaConfig | undefined) {
  const {
    mode,
    available, setAvailable,
    selected, setSelected,
    customInput, setCustomInput,
    setStep,
  } = useAnalysisWizardStore();

  const saveCriteria = useSaveCriteria();
  const savedGroups = savedCriteria?.[mode] ?? [];

  /**
   * Категорії режиму з урахуванням ще не збережених чипів (позначка — з вибору в майстрі). Збережені
   * категорії, яких немає серед чипів, лишаються як є — PUT замінює список цілком.
   */
  function currentGroups(): CriterionGroup[] {
    const { available: names, selected: chosen } = useAnalysisWizardStore.getState();
    const byName = new Map(savedGroups.map((g) => [g.name, g]));
    const shown = names.map((name) => ({ ...(byName.get(name) ?? { name, aliases: [] }), enabled: chosen.has(name) }));
    const nameSet = new Set(names);
    return [...shown, ...savedGroups.filter((g) => !nameSet.has(g.name))];
  }

  function mergeCriteria(incoming: string[]): number {
    const { added } = absorbIncoming(currentGroups(), incoming);
    setAvailable((prev) => [...prev, ...added]);
    setSelected((prev) => new Set([...prev, ...added]));
    return added.length;
  }

  const generation = useCriteriaGeneration(searchId, mode, {
    freshOf: (criteria) => absorbIncoming(currentGroups(), criteria).added,
    onAdd: mergeCriteria,
  });

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
    if (mergeCriteria([c]) === 0) {
      // Уже є як назва чи синонім — обрати наявну категорію.
      const existing = aliasLookup(currentGroups()).get(phraseKey(c));
      if (existing) {
        setAvailable((prev) => (prev.includes(existing) ? prev : [...prev, existing]));
        setSelected((prev) => new Set([...prev, existing]));
        toaster.create({ type: 'info', title: `Уже є категорія «${existing}» — обрано` });
      }
    }
    setCustomInput('');
  }

  async function goToMatching() {
    if (!available.some((c) => selected.has(c))) {
      toaster.create({ type: 'error', title: 'Оберіть хоча б один критерій' });
      return;
    }
    try {
      const groups = currentGroups();
      await saveCriteria.mutateAsync(mode === 'cons' ? { searchId, cons: groups } : { searchId, pros: groups });
      setStep(2);
    } catch (err) {
      showErrorToast('Не вдалося зберегти критерії', err);
    }
  }

  const chosenCount = available.filter((c) => selected.has(c)).length;

  return {
    showCriteriaAssistant: generation.showAssistant,
    setShowCriteriaAssistant: generation.setShowAssistant,
    criteriaParts: generation.assistantParts,
    toggleCriterion, addCustom,
    handleGenerateCriteria: generation.handleGenerate,
    generateCriteriaIsPending: generation.generatePending,
    openCriteriaAssistant: generation.openAssistant,
    handleImportCriteria: generation.handleImport,
    importCriteriaIsPending: generation.importPending,
    newCriteria: generation.candidates,
    addNewCriteria: generation.addCandidates,
    addNewCriteriaPending: generation.addPending,
    dismissNewCriteria: generation.dismissCandidates,
    goToMatching,
    saveCriteriaIsPending: saveCriteria.isPending,
    chosenCount,
    savedGroups,
  };
}
