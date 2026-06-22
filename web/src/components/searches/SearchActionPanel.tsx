import { Stack, Text } from '@chakra-ui/react';
import {
  DialogBackdrop,
  DialogBody,
  DialogCloseTrigger,
  DialogContent,
  DialogHeader,
  DialogRoot,
  DialogTitle,
  DialogTrigger,
} from '../ui/dialog';
import { Button } from '@chakra-ui/react';
import { Box } from '@chakra-ui/react';
import { LuRefreshCw } from 'react-icons/lu';
import { ConfirmActionDialog } from '../ConfirmActionDialog';
import { ActionPanelStats } from './action-panel/ActionPanelStats';
import { ActionPanelLastScan } from './action-panel/ActionPanelLastScan';
import { ActionPanelButtons } from './action-panel/ActionPanelButtons';
import { ScanProgressPanel } from './action-panel/ScanProgressPanel';
import { ScanStatusChip } from './action-panel/ScanStatusChip';
import { ScanPlanReportDialog } from './action-panel/ScanPlanReportDialog';
import { useSearchActionPanel } from '../../hooks/useSearchActionPanel';
import { DEEP_SCAN_SECONDS_PER_REQUEST } from '../../constants';
import { parsePriceRange, formatPriceRange } from '../../utils/format';
import type { Search } from '../../types';
import { useSettingsStore } from '../../stores/settingsStore';

interface Props {
  search: Search;
}

/** Панель дій вибраного пошуку у вигляді модального вікна: статистика + картки запуску сканування. */
export function SearchActionPanel({ search }: Props) {
  const {
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
    stats,
    status,
    lastScan,
    verifyCandidates,
    visibleTotal,
    willSplit,
    deepScanBuckets,
    deepScanRequests,
    deepScanMinutes,
    startDeepScan,
    runScan,
    stopScan,
    runVerifyPass,
    startAnalysis,
    startFreshAnalysis,
    runPlan,
  } = useSearchActionPanel(search);

  return (
    <>
      {/* Згорнутий скан — індикатор у хедері повертає модалку (docs/plans/scan-progress-detail.md). */}
      {isScanning && !dialogOpen && status && scanKind && (
        <ScanStatusChip scanKind={scanKind} status={status} onClick={() => setDialogOpen(true)} />
      )}
      <DialogRoot
        open={dialogOpen}
        onOpenChange={(details) => setDialogOpen(details.open)}
        size="lg"
        placement="center"
        closeOnInteractOutside={false}
      >
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" colorPalette="accent">
          <Box as={LuRefreshCw} animation={isScanning ? 'spin 2s linear infinite' : undefined} />
          Сканувати
        </Button>
      </DialogTrigger>
      <DialogBackdrop />
      <DialogContent>
        <DialogCloseTrigger />
        <DialogHeader>
          <DialogTitle>Сканування та статистика</DialogTitle>
          <Text textStyle="xs" color="fg.muted" mt={1}>
            Пошук: <strong>{search.name}</strong>
          </Text>
        </DialogHeader>

        <DialogBody pb={6}>
          <Stack gap={5}>
            <ActionPanelStats visibleTotal={visibleTotal} stats={stats} />
            
            <ActionPanelLastScan lastScan={lastScan} verifyCandidates={verifyCandidates} />

            {/* Деталізований прогрес сканування (docs/plans/scan-progress-detail.md) */}
            {isScanning && status && scanKind && (
              <ScanProgressPanel
                scanKind={scanKind}
                status={status}
                secondsPerRequest={DEEP_SCAN_SECONDS_PER_REQUEST}
                onStop={stopScan}
                isStopping={isStopping}
              />
            )}

            <ActionPanelButtons
              isScanning={isScanning}
              scanKind={scanKind}
              verifyCandidates={verifyCandidates}
              willSplit={willSplit}
              deepScanBuckets={deepScanBuckets}
              deepScanRequests={deepScanRequests}
              deepScanMinutes={deepScanMinutes}
              onRunQuickScan={() => runScan(false)}
              onStartDeepScan={startDeepScan}
              onRunVerifyPass={runVerifyPass}
              onStartAnalysis={startAnalysis}
            />
          </Stack>
        </DialogBody>
      </DialogContent>
      </DialogRoot>

      {/*
        ConfirmActionDialog і ScanPlanReportDialog — окремі DialogRoot. Тримаємо їх СУСІДАМИ
        головної модалки скану, а НЕ вкладеними всередині неї: вкладений модальний Dialog.Root
        у Chakra v3, закриваючись, не прибирає aria-hidden/inert із батьківської модалки — та
        лишається з pointer-events і блокує всі кліки (не можна ні зупинити скан, ні закрити).
      */}
      <ConfirmActionDialog
        open={confirmDeepOpen}
        onOpenChange={setConfirmDeepOpen}
        title="Запустити глибокий скан?"
        description={
          willSplit
            ? `Пошук великий (${visibleTotal!.toLocaleString('uk-UA')} на OLX) — скан розіб'є його на ~${deepScanBuckets} цінових діапазони, ~${deepScanRequests} запитів з паузами (~${deepScanMinutes} хв). Продовжити?`
            : `Глибокий скан зробить до ~${deepScanRequests} запитів до OLX з паузами (~${deepScanMinutes} хв) і додасть у базу оголошення з глибини видачі. Продовжити?`
        }
        confirmLabel="Сканувати"
        onConfirm={(skipNextTime) => {
          if (skipNextTime) useSettingsStore.getState().setSkipDeepScanConfirm(true);
          runScan(true);
        }}
      />

      <ScanPlanReportDialog
        open={reportOpen}
        onOpenChange={setReportOpen}
        plan={scanPlan}
        onConfirm={runPlan}
        onNewAnalysis={startFreshAnalysis}
        planValid={planValid}
        analyzedAt={analyzedAt}
        priceFilterLabel={(() => {
          const r = parsePriceRange(search.api_filters);
          return r ? formatPriceRange(r.from, r.to) : null;
        })()}
      />
    </>
  );
}
