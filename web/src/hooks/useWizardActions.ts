import { useMemo, useState } from 'react';
import { useAnalysisWizardStore } from '../stores/analysisWizardStore';
import type { AnalysisScope } from '../stores/analysisWizardStore';
import { useListingsUiStore } from '../stores/listingsUiStore';
import {
  useAnalysisStatus,
  useSavedCriteria,
  useGenerateCriteria,
  fetchCriteriaPrompt,
  useImportCriteria,
  useSaveCriteria,
  useAnalyze,
  fetchAnalyzePackageZip,
  useImportAnalysis,
  useCommitAnalysis,
  exportPreview,
  useListings,
} from '../api/client';
import {
  loadAnalysisModel,
  loadAnalysisReasoning,
  loadAnalysisExtraCriteria,
} from '../utils/storage';
import { STATUS_LABELS } from '../utils/status';
import { showErrorToast } from '../utils/toast';
import { toaster } from '../components/ui/toaster';
import { useListingsMap } from './useListingsMap';
import { chunk } from '../utils/array';
import {
  ANALYSIS_SOURCE,
  ANALYZE_CHUNK,
  COMMIT_CHUNK,
  MANUAL_MODEL,
  MODE_LABELS,
} from '../constants';
import type { AnalyzedListing, Listing, MatchedItem, PackagePart, Search } from '../types';

export function useWizardActions(search: Search, selectedIds: number[], open: boolean) {
  const { data: status } = useAnalysisStatus();
  const { data: savedCriteria } = useSavedCriteria(open ? search.id : null);
  const { data: listings } = useListings(open ? search.id : null);
  const listingById = useListingsMap(listings);

  const {
    mode, setMode,
    scope, setScope,
    step, setStep,
    available, setAvailable,
    selected, setSelected,
    customInput, setCustomInput,
    accumulated, setAccumulated,
    includedOverrides, setIncludedOverrides,
    criteriaLoadedMode, setCriteriaLoadedMode,
    bindSearch,
    reset,
  } = useAnalysisWizardStore();
  const statusFilter = useListingsUiStore((s) => s.statusFilter);

  // Ephemeral UI
  const [showCriteriaAssistant, setShowCriteriaAssistant] = useState(false);
  const [criteriaParts, setCriteriaParts] = useState<PackagePart[]>([]);
  const [showMatchAssistant, setShowMatchAssistant] = useState(false);
  const [zipDownloading, setZipDownloading] = useState(false);
  const [analyzeProgress, setAnalyzeProgress] = useState<{ done: number; total: number } | null>(null);
  const [openDescriptionListing, setOpenDescriptionListing] = useState<Listing | null>(null);
  const [confirmOverwrite, setConfirmOverwrite] = useState(false);
  const [commitProgress, setCommitProgress] = useState<{ done: number; total: number } | null>(null);
  const [mergeMode, setMergeMode] = useState<'append' | 'replace'>('append');

  const generateCriteria = useGenerateCriteria();
  const importCriteria = useImportCriteria();
  const saveCriteria = useSaveCriteria();
  const analyze = useAnalyze();
  const importAnalysis = useImportAnalysis();
  const commit = useCommitAnalysis();

  const allIds = useMemo(() => (listings ?? []).map((l) => l.id), [listings]);

  const effectiveIds = useMemo(() => {
    if (scope === 'selected') return selectedIds;
    if (scope === 'tab') {
      if (statusFilter === 'all') return allIds;
      return allIds.filter((id) => listingById.get(id)?.status === statusFilter);
    }
    return allIds;
  }, [scope, selectedIds, allIds, listingById, statusFilter]);

  const apiAvailable = status?.apiAvailable ?? false;
  const model = loadAnalysisModel();
  const reasoning = loadAnalysisReasoning();
  const extra = loadAnalysisExtraCriteria();

  function computeDefaultScope(): AnalysisScope {
    if (selectedIds.length > 0) return 'selected';
    if (statusFilter !== 'all') return 'tab';
    return 'all';
  }

  // ── Критерії ──────────────────────────────────────────────

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
        searchId: search.id,
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
      const { prompt } = await fetchCriteriaPrompt(search.id, mode, extra);
      setCriteriaParts([{ name: `критерії-${mode}.txt`, content: prompt }]);
    } catch (err) {
      showErrorToast('Не вдалося підготувати промпт', err);
    }
  }

  function handleImportCriteria(raw: string) {
    importCriteria.mutate(
      { searchId: search.id, mode, raw },
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
        mode === 'cons' ? { searchId: search.id, cons: chosen } : { searchId: search.id, pros: chosen },
      );
      setStep(2);
    } catch (err) {
      showErrorToast('Не вдалося зберегти критерії', err);
    }
  }

  // ── Аналіз ─────────────────────────────────────────────────

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
        const res = await analyze.mutateAsync({ searchId: search.id, mode, ids, model, reasoning });
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
      await fetchAnalyzePackageZip(search.id, mode, effectiveIds);
      setShowMatchAssistant(true);
    } catch (err) {
      showErrorToast('Не вдалося підготувати ZIP-пакет', err);
    } finally {
      setZipDownloading(false);
    }
  }

  function handleImportMatching(raw: string) {
    importAnalysis.mutate(
      { searchId: search.id, mode, raw, accumulated },
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

  // ── Перевірка (крок 3) ─────────────────────────────────────

  function criterionKey(id: number, criterion: string): string {
    return `${id}:${criterion.toLowerCase()}`;
  }

  function isIncluded(id: number, item: MatchedItem): boolean {
    return includedOverrides.get(criterionKey(id, item.criterion)) ?? item.ok;
  }

  function toggleIncluded(id: number, item: MatchedItem) {
    const key = criterionKey(id, item.criterion);
    setIncludedOverrides((prev) => {
      const next = new Map(prev);
      next.set(key, !isIncluded(id, item));
      return next;
    });
  }

  const visibleRows = useMemo(() => accumulated.filter((r) => r.items.length > 0), [accumulated]);
  const hiddenCount = accumulated.length - visibleRows.length;

  const commitItems = useMemo(
    () =>
      accumulated.map((r) => ({
        id: r.id,
        criteria: r.items.filter((it) => isIncluded(r.id, it)).map((it) => it.criterion),
      })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [accumulated, includedOverrides],
  );

  const overwriteCount = useMemo(() => {
    let n = 0;
    for (const item of commitItems) {
      const l = listingById.get(item.id);
      if (l && (mode === 'cons' ? l.cons : l.pros)) n++;
    }
    return n;
  }, [commitItems, listingById, mode]);

  // ── Запис (крок 4) ──────────────────────────────────────────

  async function doCommit(closeDialog: () => void) {
    setCommitProgress({ done: 0, total: commitItems.length });
    try {
      let done = 0;
      for (const batch of chunk(commitItems, COMMIT_CHUNK)) {
        await commit.mutateAsync({
          searchId: search.id,
          mode,
          items: batch,
          model: apiAvailable && status ? model : MANUAL_MODEL,
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

  async function handleExport(format: 'xlsx' | 'json') {
    const rows = accumulated.map((r) => {
      const l = listingById.get(r.id);
      return {
        title: l?.title ?? '',
        description: l?.description ?? '',
        criteria: r.items.filter((it) => isIncluded(r.id, it)).map((it) => it.criterion),
      };
    });
    try {
      await exportPreview(search.id, mode, format, rows);
    } catch (err) {
      showErrorToast('Помилка експорту', err);
    }
  }

  // ── Обчислення для UI ──────────────────────────────────────

  const modeLabel = MODE_LABELS[mode];
  const chosenCount = available.filter((c) => selected.has(c)).length;
  const tabCount = statusFilter !== 'all'
    ? allIds.filter((id) => listingById.get(id)?.status === statusFilter).length
    : 0;

  const scopeLabel =
    scope === 'selected' ? 'Вибрані'
    : scope === 'tab' && statusFilter !== 'all' && statusFilter !== 'ai_picks'
      ? STATUS_LABELS[statusFilter as keyof typeof STATUS_LABELS]
    : 'Весь пошук';

  return {
    // Identity
    searchId: search.id,
    // Store state
    mode, setMode,
    scope, setScope,
    step, setStep,
    available,
    selected,
    customInput, setCustomInput,
    accumulated,
    criteriaLoadedMode, setCriteriaLoadedMode,
    bindSearch, reset,
    // Computed
    allIds, effectiveIds, listingById,
    apiAvailable, modeLabel, scopeLabel, chosenCount, tabCount,
    visibleRows, hiddenCount, commitItems, overwriteCount,
    // Saved criteria (for useEffect in dialog)
    savedCriteria,
    // Criteria step
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
    computeDefaultScope,
    // Matching step
    showMatchAssistant,
    zipDownloading,
    analyzeProgress,
    runAutoAnalyze,
    downloadZipPackage,
    handleImportMatching,
    importAnalysisIsPending: importAnalysis.isPending,
    // Review step
    openDescriptionListing, setOpenDescriptionListing,
    isIncluded, toggleIncluded,
    // Commit step
    confirmOverwrite, setConfirmOverwrite,
    commitProgress,
    mergeMode, setMergeMode,
    doCommit,
    handleCommitClick,
    handleExport,
    // Filter
    statusFilter,
    selectedIds,
  };
}
