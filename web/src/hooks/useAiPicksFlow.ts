import { useCallback, useEffect, useState } from 'react';
import {
  useRunAiPicks,
  useImportAiPicks,
  useCommitAiPicks,
  fetchAiPicksPrompt,
  fetchAiPicksPackageZip,
} from '../api';
import { useSettingsStore } from '../stores/settingsStore';
import { showErrorToast } from '../utils/toast';
import { toaster } from '../components/ui/toaster';
import { useAiScope } from './analysis/useAiScope';
import { getDefaultScope, type AiScope } from '../utils/aiScope';
import { useZipDownload } from './useZipDownload';
import { MANUAL_PICKS_ZIP_CHUNK_SIZE, PICK_CANDIDATES_LIMIT, PICK_TOP_N } from '../constants';
import type { PickItem, PickResult, Search } from '../types';

export type AiPicksStep = 'idle' | 'running' | 'done';

export function useAiPicksFlow(search: Search, selectedIds: number[], open: boolean) {
  const [step, setStep] = useState<AiPicksStep>('idle');
  const [pendingPicks, setPendingPicks] = useState<PickItem[]>([]);
  const [summary, setSummary] = useState('');
  const [prompt, setPrompt] = useState<string | null>(null);
  const [loadingPrompt, setLoadingPrompt] = useState(false);
  // Дефолт «AI Picks» = найкращі кандидати; інші обсяги доступні вручну.
  const [scope, setScope] = useState<AiScope>('candidates');

  const { listingById: listingsMap, counts, effectiveIds, statusFilter } = useAiScope(
    search.id,
    selectedIds,
    open,
    scope,
  );

  // При кожному відкритті повертаємо дефолтний обсяг (найкращі кандидати).
  useEffect(() => {
    if (!open) return;
    setScope(getDefaultScope(selectedIds, statusFilter, { preferCandidates: true }));
  }, [open, selectedIds.length, statusFilter]);

  const runAiPicks = useRunAiPicks();
  const importAiPicks = useImportAiPicks();
  const commitAiPicks = useCommitAiPicks();

  // Пул для ранжування = ID обраного обсягу. Сервер усе одно впорядкує за ціною й обмежить ліміт.
  const candidateCount = effectiveIds.length;
  const promptCount = Math.min(candidateCount, PICK_CANDIDATES_LIMIT);
  const useZip = promptCount > MANUAL_PICKS_ZIP_CHUNK_SIZE;

  const zipDownload = useZipDownload(
    useCallback(() => fetchAiPicksPackageZip(search.id, effectiveIds), [search.id, effectiveIds]),
    'Не вдалося підготувати ZIP-пакет',
  );

  // Зміна обсягу інвалідовує раніше завантажені промпт/ZIP (пул інший).
  useEffect(() => {
    setPrompt(null);
    zipDownload.resetDownload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scope]);

  function applyResult(result: PickResult) {
    setPendingPicks(result.picks);
    setSummary(result.summary);
    setStep('done');
  }

  async function handleRun() {
    setStep('running');
    try {
      const result = await runAiPicks.mutateAsync({
        searchId: search.id,
        model: useSettingsStore.getState().analysisModel,
        ids: effectiveIds,
      });
      applyResult(result);
    } catch (err) {
      setStep('idle');
      showErrorToast('Помилка AI-ранжування', err);
    }
  }

  async function handleImport(raw: string) {
    try {
      const result = await importAiPicks.mutateAsync({ searchId: search.id, raw, ids: effectiveIds });
      applyResult(result);
    } catch (err) {
      showErrorToast('Помилка парсингу відповіді', err);
    }
  }

  async function handleCommit(onSuccess: () => void) {
    try {
      await commitAiPicks.mutateAsync({ searchId: search.id, picks: pendingPicks });
      toaster.create({ type: 'success', title: `Збережено ${pendingPicks.length} оголошень` });
      onSuccess();
      reset();
    } catch (err) {
      showErrorToast('Помилка збереження', err);
    }
  }

  async function loadPrompt() {
    if (prompt !== null) return;
    setLoadingPrompt(true);
    try {
      const { prompt: p } = await fetchAiPicksPrompt(search.id, effectiveIds);
      setPrompt(p);
    } catch {
      setPrompt('');
    } finally {
      setLoadingPrompt(false);
    }
  }

  function reset() {
    setStep('idle');
    setPendingPicks([]);
    setSummary('');
    setPrompt(null);
    zipDownload.resetDownload();
  }

  return {
    // Стан
    step,
    pendingPicks,
    summary,
    prompt,
    loadingPrompt,
    listingsMap,
    // Обсяг
    scope,
    setScope,
    counts,
    statusFilter,
    // Обчислення
    candidateCount,
    promptCount,
    useZip,
    PICK_TOP_N,
    PICK_CANDIDATES_LIMIT,
    // ZIP
    zipDownload,
    // Дії
    handleRun,
    handleImport,
    handleCommit,
    loadPrompt,
    reset,
    // Мутації (для isPending)
    importIsPending: importAiPicks.isPending,
    commitIsPending: commitAiPicks.isPending,
  };
}
