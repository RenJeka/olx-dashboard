import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useAnalyzeScan, useLastAnalysis, useRunScanPlan } from '../api';
import { toaster } from '../components/ui/toaster';
import { SCAN_PLAN_TTL_MIN } from '../constants';
import { describeScanResult, isUserAbort } from '../utils/scanRun';
import type { ScanPlan } from '../types';

export type ScanKind = 'normal' | 'deep' | 'verify' | 'analyze' | null;

/**
 * Двофазний глибокий скан (docs/plans/old/two-phase-deep-scan.md): аналіз → звіт → підтверджений запуск.
 * `dialogOpen` — підвантажувати збережений аналіз лише при відкритому діалозі скану; `setScanKind` — спільний із
 * панеллю дій індикатор активного скану.
 */
export function useScanPlanReport(searchId: number, dialogOpen: boolean, setScanKind: (kind: ScanKind) => void) {
  const [scanPlan, setScanPlan] = useState<ScanPlan | null>(null);
  const [reportOpen, setReportOpen] = useState(false);
  // Чи валідний planToken показуваного звіту (свіжий аналіз — true; історичний — з бекенду).
  const [planValid, setPlanValid] = useState(true);
  const [analyzedAt, setAnalyzedAt] = useState<string | null>(null);

  const qc = useQueryClient();
  const analyze = useAnalyzeScan();
  const runPlanMutation = useRunScanPlan();
  // Останній збережений аналіз — підвантажуємо при відкритому діалозі (для перегляду без зондування).
  const { data: lastAnalysis, isLoading: isLastAnalysisLoading } = useLastAnalysis(searchId, dialogOpen);

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
    // Запит ще вантажиться (швидкий клік одразу після відкриття діалогу): НЕ запускаємо свіже
    // зондування передчасно — інакше витратимо бюджет запитів OLX, хоча збережений аналіз може
    // ще приїхати. Чекаємо завершення завантаження (клік просто ігнорується).
    if (isLastAnalysisLoading) return;
    startFreshAnalysis();
  }

  /** Свіжа аналітична фаза: зондування + бісекція, без допагінації — відкриває звіт. */
  function startFreshAnalysis() {
    setScanKind('analyze');
    setReportOpen(false); // сховати старий звіт, щоб було видно прогрес у панелі
    analyze.mutate(
      { searchId, deep: true },
      {
        onSuccess: (plan) => {
          setScanPlan(plan);
          setPlanValid(true);
          setAnalyzedAt(new Date().toISOString());
          setReportOpen(true);
          qc.invalidateQueries({ queryKey: ['last-analysis', searchId] });
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
      { searchId, planToken: scanPlan.planToken },
      {
        onSuccess: (r) => {
          const { title, description } = describeScanResult(r, true);
          toaster.create({ type: r.stopped ? 'info' : 'success', title, description });
          setScanPlan(null);
          // План одноразовий — після запуску збережений аналіз стає невалідним для повторного run.
          qc.invalidateQueries({ queryKey: ['last-analysis', searchId] });
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
    scanPlan,
    reportOpen,
    setReportOpen,
    planValid,
    analyzedAt,
    startAnalysis,
    startFreshAnalysis,
    runPlan,
  };
}
