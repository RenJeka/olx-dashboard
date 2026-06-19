import { useState } from 'react';
import { useScan, useVerify, useSearchStats, useScanStatus } from '../api';
import { toaster } from '../components/ui/toaster';
import { useSettingsStore } from '../stores/settingsStore';
import {
  DEEP_SCAN_SPLIT_THRESHOLD,
  DEEP_SCAN_PAGE_LIMIT,
  DEEP_SCAN_MAX_PAGES,
  DEEP_SCAN_SECONDS_PER_REQUEST,
} from '../constants';
import type { Search } from '../types';

/**
 * Хук керування станом та логікою панелі дій пошуку (сканування, перевірка неактивних).
 */
export function useSearchActionPanel(search: Search) {
  const [scanKind, setScanKind] = useState<'normal' | 'deep' | 'verify' | null>(null);
  const [confirmDeepOpen, setConfirmDeepOpen] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);

  const scan = useScan();
  const verify = useVerify();
  const { data: stats } = useSearchStats(search.id);
  const { data: status } = useScanStatus(search.id, scanKind != null);

  const isScanning = scanKind != null;
  const lastScan = stats?.last_scan;
  const verifyCandidates = stats?.verify_candidates ?? 0;

  // ── Обчислення для глибокого скану ──────────────────────────────────────────
  const visibleTotal = search.visible_total_count;
  const willSplit = visibleTotal != null && visibleTotal > DEEP_SCAN_SPLIT_THRESHOLD;
  const deepScanBuckets = willSplit
    ? Math.ceil(visibleTotal! / DEEP_SCAN_SPLIT_THRESHOLD)
    : 1;
  const deepScanRequests =
    visibleTotal != null
      ? willSplit
        ? Math.ceil(visibleTotal / DEEP_SCAN_PAGE_LIMIT)
        : Math.min(DEEP_SCAN_MAX_PAGES, Math.ceil(visibleTotal / DEEP_SCAN_PAGE_LIMIT))
      : DEEP_SCAN_MAX_PAGES;
  const deepScanMinutes = Math.max(
    1,
    Math.round((deepScanRequests * DEEP_SCAN_SECONDS_PER_REQUEST) / 60),
  );

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
          const bucketsSuffix =
            r.bucketsUsed != null && r.bucketsUsed > 1 ? ` · діапазонів ${r.bucketsUsed}` : '';
          const description = deep
            ? `${r.requestsUsed} запитів · знайдено ${r.found} · нових ${r.new_count} · вимкнено ${r.disabled_count}${bucketsSuffix}`
            : `Знайдено ${r.found} · нових ${r.new_count} · вимкнено ${r.disabled_count}`;
          toaster.create({
            type: 'success',
            title: deep ? 'Глибокий скан завершено' : 'Скан завершено',
            description,
          });
        },
        onError: (err) =>
          toaster.create({
            type: 'error',
            title: 'Помилка скану',
            description: err instanceof Error ? err.message : String(err),
          }),
        onSettled: () => setScanKind(null),
      },
    );
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
        toaster.create({
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
    runVerifyPass,
  };
}
