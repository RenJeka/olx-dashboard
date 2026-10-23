import { useState } from 'react';
import { useScan, useVerify, useSearchStats, useScanStatus, useStopScan } from '../api';
import { toaster } from '../components/ui/toaster';
import { useSettingsStore } from '../stores/settingsStore';
import { describeScanResult, estimateDeepScan, isUserAbort } from '../utils/scanRun';
import type { Search } from '../types';
import { useScanPlanReport, type ScanKind } from './useScanPlanReport';

/**
 * Хук керування станом та логікою панелі дій пошуку (сканування, перевірка неактивних,
 * двофазний глибокий скан — аналіз → звіт → підтверджений запуск — у useScanPlanReport).
 */
export function useSearchActionPanel(search: Search) {
  const [scanKind, setScanKind] = useState<ScanKind>(null);
  const [confirmDeepOpen, setConfirmDeepOpen] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);

  const scan = useScan();
  const verify = useVerify();
  const stopMutation = useStopScan();
  const { data: stats } = useSearchStats(search.id);
  const { data: status } = useScanStatus(search.id, scanKind != null);
  const report = useScanPlanReport(search.id, dialogOpen, setScanKind);

  const isScanning = scanKind != null;
  const isStopping = stopMutation.isPending;
  const lastScan = stats?.last_scan;
  const verifyCandidates = stats?.verify_candidates ?? 0;

  // ── Обчислення для глибокого скану ──────────────────────────────────────────
  const visibleTotal = search.visible_total_count;
  const { willSplit, deepScanBuckets, deepScanRequests, deepScanMinutes } = estimateDeepScan(visibleTotal);

  // ── Методи ────────────────────────────────────────────────────────────────
  function startDeepScan() {
    if (useSettingsStore.getState().skipDeepScanConfirm) {
      runScan(true);
    } else {
      setConfirmDeepOpen(true);
    }
  }

  function runScan(deep: boolean) {
    const kind = deep ? 'deep' : 'normal';
    setScanKind(kind);
    scan.mutate(
      { searchId: search.id, deep },
      {
        onSuccess: (r) => {
          const { title, description } = describeScanResult(r, deep);
          toaster.create({ type: r.stopped ? 'info' : 'success', title, description });
        },
        onError: (err) =>
          isUserAbort(err)
            ? toaster.create({ type: 'info', title: 'Скан зупинено' })
            : toaster.create({
                type: 'error',
                title: 'Помилка скану',
                description: err instanceof Error ? err.message : String(err),
              }),
        onSettled: () => setScanKind(null),
      },
    );
  }

  /** Зупинка активного скану: зібране буде збережено, скан завершиться частковим успіхом. */
  function stopScan() {
    if (!isScanning) return;
    stopMutation.mutate(search.id, {
      onError: (err) =>
        toaster.create({
          type: 'error',
          title: 'Не вдалося зупинити',
          description: err instanceof Error ? err.message : String(err),
        }),
    });
  }

  function runVerifyPass() {
    setScanKind('verify');
    verify.mutate(search.id, {
      onSuccess: (r) => {
        toaster.create({
          type: 'success',
          title: 'Перевірку завершено',
          description: `Перевірено ${r.checked} · живих ${r.alive} · мертвих ${r.dead} · реактивовано ${r.reactivated} · вимкнено ${r.disabled_count} · дозаповнено ${r.backfilled}`,
        });
      },
      onError: (err) =>
        isUserAbort(err)
          ? toaster.create({ type: 'info', title: 'Перевірку зупинено' })
          : toaster.create({
              type: 'error',
              title: 'Помилка перевірки',
              description: err instanceof Error ? err.message : String(err),
            }),
      onSettled: () => setScanKind(null),
    });
  }

  return {
    // Стан
    dialogOpen,
    setDialogOpen,
    confirmDeepOpen,
    setConfirmDeepOpen,
    scanKind,
    isScanning,
    isStopping,
    scanPlan: report.scanPlan,
    reportOpen: report.reportOpen,
    setReportOpen: report.setReportOpen,
    planValid: report.planValid,
    analyzedAt: report.analyzedAt,

    // Дані
    stats,
    status,
    lastScan,
    verifyCandidates,

    // Обчислення
    visibleTotal,
    willSplit,
    deepScanBuckets,
    deepScanRequests,
    deepScanMinutes,

    // Дії
    startDeepScan,
    runScan,
    stopScan,
    runVerifyPass,
    startAnalysis: report.startAnalysis,
    startFreshAnalysis: report.startFreshAnalysis,
    runPlan: report.runPlan,
  };
}
