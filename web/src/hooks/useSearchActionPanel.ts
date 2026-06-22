import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  useScan,
  useVerify,
  useSearchStats,
  useScanStatus,
  useAnalyzeScan,
  useRunScanPlan,
  useStopScan,
  useLastAnalysis,
} from '../api';
import { toaster } from '../components/ui/toaster';
import { useSettingsStore } from '../stores/settingsStore';
import {
  DEEP_SCAN_SPLIT_THRESHOLD,
  DEEP_SCAN_PAGE_LIMIT,
  DEEP_SCAN_MAX_PAGES,
  DEEP_SCAN_SECONDS_PER_REQUEST,
  SCAN_PLAN_TTL_MIN,
} from '../constants';
import type { Search, ScanPlan, ScanResult } from '../types';

/**
 * Зупинка користувачем (кнопка «Зупинити») приходить як кинута помилка з текстом
 * «…зупинено користувачем». Це НЕ збій — показуємо нейтральний info-тост, а не error.
 */
function isUserAbort(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return /зупинено користувачем/i.test(msg);
}

/**
 * Опис результату скану для toast: дедуп між синонімами (сирих/злито дублів,
 * docs/plans/deep-scan-stop-and-history.md) + позначка зупинки користувачем.
 */
function describeScanResult(r: ScanResult, deep: boolean): { title: string; description: string } {
  const bucketsSuffix = r.bucketsUsed != null && r.bucketsUsed > 1 ? ` · діапазонів ${r.bucketsUsed}` : '';
  const dedupSuffix =
    r.rawFound != null && r.rawFound > r.found
      ? ` · сирих ${r.rawFound} · злито дублів ${r.rawFound - r.found}`
      : '';
  const description = deep
    ? `${r.requestsUsed} запитів · унікальних ${r.found} · нових ${r.new_count} · вимкнено ${r.disabled_count}${bucketsSuffix}${dedupSuffix}`
    : `Унікальних ${r.found} · нових ${r.new_count} · вимкнено ${r.disabled_count}${dedupSuffix}`;
  const title = r.stopped
    ? 'Скан зупинено — збережено зібране'
    : deep
      ? 'Глибокий скан завершено'
      : 'Скан завершено';
  return { title, description };
}

/**
 * Хук керування станом та логікою панелі дій пошуку (сканування, перевірка неактивних,
 * двофазний глибокий скан — аналіз → звіт → підтверджений запуск, docs/plans/two-phase-deep-scan.md).
 */
export function useSearchActionPanel(search: Search) {
  const [scanKind, setScanKind] = useState<'normal' | 'deep' | 'verify' | 'analyze' | null>(null);
  const [confirmDeepOpen, setConfirmDeepOpen] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [scanPlan, setScanPlan] = useState<ScanPlan | null>(null);
  const [reportOpen, setReportOpen] = useState(false);
  // Чи валідний planToken показуваного звіту (свіжий аналіз — true; історичний — з бекенду).
  const [planValid, setPlanValid] = useState(true);
  const [analyzedAt, setAnalyzedAt] = useState<string | null>(null);

  const qc = useQueryClient();
  const scan = useScan();
  const verify = useVerify();
  const analyze = useAnalyzeScan();
  const runPlanMutation = useRunScanPlan();
  const stopMutation = useStopScan();
  const { data: stats } = useSearchStats(search.id);
  const { data: status } = useScanStatus(search.id, scanKind != null);
  // Останній збережений аналіз — підвантажуємо при відкритому діалозі (для перегляду без зондування).
  const { data: lastAnalysis } = useLastAnalysis(search.id, dialogOpen);

  const isScanning = scanKind != null;
  const isStopping = stopMutation.isPending;
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

  /**
   * Кнопка «Аналіз перед сканом»: якщо є збережений аналіз — показуємо його (без повторного
   * зондування) із кнопкою «Зробити новий аналіз»; інакше одразу запускаємо свіжий аналіз.
   */
  function startAnalysis() {
    if (lastAnalysis) {
      setScanPlan(lastAnalysis.plan);
      setPlanValid(lastAnalysis.planValid);
      setAnalyzedAt(lastAnalysis.analyzedAt);
      setReportOpen(true);
      return;
    }
    startFreshAnalysis();
  }

  /** Свіжа аналітична фаза: зондування + бісекція, без допагінації — відкриває звіт. */
  function startFreshAnalysis() {
    setScanKind('analyze');
    setReportOpen(false); // сховати старий звіт, щоб було видно прогрес у панелі
    analyze.mutate(
      { searchId: search.id, deep: true },
      {
        onSuccess: (plan) => {
          setScanPlan(plan);
          setPlanValid(true);
          setAnalyzedAt(new Date().toISOString());
          setReportOpen(true);
          qc.invalidateQueries({ queryKey: ['last-analysis', search.id] });
        },
        onError: (err) =>
          isUserAbort(err)
            ? toaster.create({ type: 'info', title: 'Аналіз зупинено' })
            : toaster.create({
                type: 'error',
                title: 'Помилка аналізу',
                description: err instanceof Error ? err.message : String(err),
              }),
        onSettled: () => setScanKind(null),
      },
    );
  }

  /** Запуск повного глибокого скану за зібраним планом (без повторного зондування). */
  function runPlan() {
    if (!scanPlan) return;
    setScanKind('deep');
    setReportOpen(false);
    runPlanMutation.mutate(
      { searchId: search.id, planToken: scanPlan.planToken },
      {
        onSuccess: (r) => {
          const { title, description } = describeScanResult(r, true);
          toaster.create({ type: r.stopped ? 'info' : 'success', title, description });
          setScanPlan(null);
          // План одноразовий — після запуску збережений аналіз стає невалідним для повторного run.
          qc.invalidateQueries({ queryKey: ['last-analysis', search.id] });
        },
        onError: (err) => {
          if (isUserAbort(err)) {
            toaster.create({ type: 'info', title: 'Скан зупинено' });
            return;
          }
          const message = err instanceof Error ? err.message : String(err);
          const isStale = message.includes('застарів');
          toaster.create({
            type: 'error',
            title: isStale ? 'План застарів' : 'Помилка скану',
            description: isStale ? `Повторіть аналіз — план діє лише ${SCAN_PLAN_TTL_MIN} хвилин.` : message,
          });
          if (isStale) setPlanValid(false);
        },
        onSettled: () => setScanKind(null),
      },
    );
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
    scanPlan,
    reportOpen,
    setReportOpen,
    planValid,
    analyzedAt,

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
    startAnalysis,
    startFreshAnalysis,
    runPlan,
  };
}
