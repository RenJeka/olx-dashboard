import { useState, useEffect } from 'react';
import { toaster } from '../components/ui/toaster';
import {
  useAnalysisStatus,
  useListings,
  useRelevanceTarget,
  useRelevancePreview,
  useSaveRelevanceTarget,
  useRunRelevance,
  useImportRelevance,
  useCommitRelevance,
  fetchRelevancePackageZip,
} from '../api';
import { useListingsUiStore } from '../stores/listingsUiStore';
import { loadAnalysisModel } from '../utils/storage';
import { showErrorToast } from '../utils/toast';
import { useListingsMap } from './useListingsMap';
import { chunk } from '../utils/array';
import { ANALYZE_CHUNK } from '../constants';
import type { RelevanceItem, Search } from '../types';
import { getDefaultScope, getEffectiveRelevanceIds, Scope } from '../utils/relevance';

export type RelevanceStep = 'idle' | 'running' | 'done';

export interface UseRelevanceFlowProps {
  search: Search;
  selectedIds: number[];
}

/**
 * Хук для управління станом і логікою діалогу фільтрації релевантності.
 */
export function useRelevanceFlow({ search, selectedIds }: UseRelevanceFlowProps) {
  const { data: listings } = useListings(search.id);
  const { data: status } = useAnalysisStatus();
  const { data: targetData } = useRelevanceTarget(search.id);
  const statusFilter = useListingsUiStore((s) => s.statusFilter);

  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<RelevanceStep>('idle');
  const [target, setTarget] = useState('');
  const [scope, setScope] = useState<Scope>('all');
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

  const effectiveIds = getEffectiveRelevanceIds(scope, selectedIds, statusFilter, listings);
  const listingsMap = useListingsMap(listings);

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
          model: loadAnalysisModel(),
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
      setOpen(false);
      reset();
    } catch (err) {
      showErrorToast('Помилка збереження', err);
    }
  }

  return {
    state: {
      open,
      step,
      target,
      scope,
      results,
      overrides,
      progress,
      apiAvailable,
      effectiveIds,
      preview,
      listings,
      listingsMap,
      selectedIds,
      search,
    },
    actions: {
      setOpen: (o: boolean) => {
        setOpen(o);
        if (!o) reset();
      },
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
