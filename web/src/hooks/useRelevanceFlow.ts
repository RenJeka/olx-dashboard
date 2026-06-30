import { useState, useEffect } from 'react';
import { toaster } from '../components/ui/toaster';
import {
  useAnalysisStatus,
  useRelevanceTarget,
  useRelevancePreview,
  useSaveRelevanceTarget,
  useRunRelevance,
  useImportRelevance,
  useCommitRelevance,
  fetchRelevancePackageZip,
} from '../api';
import { useListingsUiStore } from '../stores/listingsUiStore';
import { useSettingsStore } from '../stores/settingsStore';
import { showErrorToast } from '../utils/toast';
import { useAiScope } from './analysis/useAiScope';
import { chunk } from '../utils/array';
import { ANALYZE_CHUNK } from '../constants';
import type { RelevanceItem, Search } from '../types';
import { getDefaultScope, type AiScope } from '../utils/aiScope';

export type RelevanceStep = 'idle' | 'running' | 'done';

export interface UseRelevanceFlowProps {
  search: Search;
  selectedIds: number[];
  open: boolean;
  onClose: () => void;
}

/**
 * Хук для управління станом і логікою діалогу фільтрації релевантності.
 */
export function useRelevanceFlow({ search, selectedIds, open, onClose }: UseRelevanceFlowProps) {
  const { data: status } = useAnalysisStatus();
  const { data: targetData } = useRelevanceTarget(search.id);
  const statusFilter = useListingsUiStore((s) => s.statusFilter);

  const [step, setStep] = useState<RelevanceStep>('idle');
  const [target, setTarget] = useState('');
  const [scope, setScope] = useState<AiScope>('all');
  const [results, setResults] = useState<RelevanceItem[]>([]);
  const [overrides, setOverrides] = useState<Map<number, boolean>>(new Map());
  const [source, setSource] = useState<'api' | 'import'>('api');
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);

  const saveTarget = useSaveRelevanceTarget();
  const runRelevance = useRunRelevance();
  const importRelevance = useImportRelevance();
  const commitRelevance = useCommitRelevance();

  const apiAvailable = status?.apiAvailable ?? false;

  useEffect(() => {
    if (targetData) setTarget(targetData.target);
  }, [targetData]);

  useEffect(() => {
    if (!open) return;
    setScope(getDefaultScope(selectedIds, statusFilter));
  }, [open, selectedIds.length, statusFilter]);

  useEffect(() => {
    if (open) return;
    reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const { listings, listingById, counts, effectiveIds } = useAiScope(search.id, selectedIds, open, scope);

  const { data: preview } = useRelevancePreview(search.id, target, effectiveIds, open && step === 'idle');

  function reset() {
    setStep('idle');
    setResults([]);
    setOverrides(new Map());
    setProgress(null);
  }

  async function handleRun() {
    if (!target.trim()) {
      toaster.create({ type: 'warning', title: 'Вкажіть цільовий товар' });
      return;
    }
    setStep('running');
    setProgress({ done: 0, total: effectiveIds.length });
    const acc: RelevanceItem[] = [];
    try {
      for (const batch of chunk(effectiveIds, ANALYZE_CHUNK)) {
        const res = await runRelevance.mutateAsync({
          searchId: search.id,
          target: target.trim(),
          ids: batch,
          model: useSettingsStore.getState().analysisModel,
        });
        acc.push(...res.results);
        setProgress((p) => (p ? { ...p, done: p.done + batch.length } : p));
      }
      setSource('api');
      setResults(acc);
      setStep('done');
    } catch (err) {
      setStep('idle');
      setProgress(null);
      showErrorToast('Помилка класифікації', err);
    }
  }

  async function handleDownloadZip() {
    if (!target.trim()) {
      toaster.create({ type: 'warning', title: 'Вкажіть цільовий товар' });
      return;
    }
    try {
      await fetchRelevancePackageZip(search.id, target.trim(), effectiveIds);
    } catch (err) {
      showErrorToast('Помилка завантаження ZIP', err);
    }
  }

  async function handleImport(raw: string) {
    try {
      const res = await importRelevance.mutateAsync({
        searchId: search.id,
        raw,
        accumulated: results,
        ids: effectiveIds,
        target: target.trim(),
      });
      setSource('import');
      setResults(res.results);
      setStep('done');
    } catch (err) {
      showErrorToast('Помилка парсингу відповіді', err);
    }
  }

  function toggleOverride(id: number, currentRelevant: boolean) {
    setOverrides((prev) => {
      const next = new Map(prev);
      next.set(id, !currentRelevant);
      return next;
    });
  }

  async function handleCommit(items: RelevanceItem[]) {
    try {
      if (target.trim()) await saveTarget.mutateAsync({ searchId: search.id, target: target.trim() });
      const { committed } = await commitRelevance.mutateAsync({ searchId: search.id, items, source });
      const irrelevant = items.filter((i) => !i.relevant).length;
      toaster.create({
        type: 'success',
        title: `Збережено ${committed} оголошень`,
        description: `Нерелевантних: ${irrelevant}`,
      });
      onClose();
      reset();
    } catch (err) {
      showErrorToast('Помилка збереження', err);
    }
  }

  return {
    state: {
      step,
      target,
      scope,
      results,
      overrides,
      progress,
      apiAvailable,
      effectiveIds,
      counts,
      statusFilter,
      preview,
      listings,
      listingsMap: listingById,
      selectedIds,
      search,
    },
    actions: {
      setTarget,
      setScope,
      reset,
      handleRun,
      handleDownloadZip,
      handleImport,
      toggleOverride,
      handleCommit,
    },
    mutations: {
      commitRelevance,
      saveTarget,
      importRelevance,
    }
  };
}
