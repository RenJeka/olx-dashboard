import { useCallback, useState } from 'react';
import {
  useRunAiPicks,
  useImportAiPicks,
  useCommitAiPicks,
  fetchAiPicksPrompt,
  fetchAiPicksPackageZip,
  useListings,
} from '../api/client';
import { loadAnalysisModel } from '../utils/storage';
import { isAiPickCandidate } from '../utils/listingVisibility';
import { showErrorToast } from '../utils/toast';
import { toaster } from '../components/ui/toaster';
import { useListingsMap } from './useListingsMap';
import { useZipDownload } from './useZipDownload';
import { MANUAL_PICKS_ZIP_CHUNK_SIZE, PICK_CANDIDATES_LIMIT, PICK_TOP_N } from '../constants';
import type { PickItem, PickResult, Search } from '../types';

export type AiPicksStep = 'idle' | 'running' | 'done';

export function useAiPicksFlow(search: Search) {
  const { data: listings } = useListings(search.id);
  const listingsMap = useListingsMap(listings);

  const [step, setStep] = useState<AiPicksStep>('idle');
  const [pendingPicks, setPendingPicks] = useState<PickItem[]>([]);
  const [summary, setSummary] = useState('');
  const [prompt, setPrompt] = useState<string | null>(null);
  const [loadingPrompt, setLoadingPrompt] = useState(false);

  const runAiPicks = useRunAiPicks();
  const importAiPicks = useImportAiPicks();
  const commitAiPicks = useCommitAiPicks();

  const candidateCount = (listings ?? []).filter(isAiPickCandidate).length;
  const promptCount = Math.min(candidateCount, PICK_CANDIDATES_LIMIT);
  const useZip = promptCount > MANUAL_PICKS_ZIP_CHUNK_SIZE;

  const zipDownload = useZipDownload(
    useCallback(() => fetchAiPicksPackageZip(search.id), [search.id]),
    'Не вдалося підготувати ZIP-пакет',
  );

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
        model: loadAnalysisModel(),
      });
      applyResult(result);
    } catch (err) {
      setStep('idle');
      showErrorToast('Помилка AI-ранжування', err);
    }
  }

  async function handleImport(raw: string) {
    try {
      const result = await importAiPicks.mutateAsync({ searchId: search.id, raw });
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
      const { prompt: p } = await fetchAiPicksPrompt(search.id);
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
