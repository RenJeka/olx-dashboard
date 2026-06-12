import { useState } from 'react';
import { Box, Button, HStack, Progress, Stack, Text } from '@chakra-ui/react';
import { LuLayers, LuRefreshCw, LuStethoscope, LuTriangleAlert } from 'react-icons/lu';
import { ConfirmActionDialog } from './ConfirmActionDialog';
import { Tooltip } from './ui/tooltip';
import { toaster } from './ui/toaster';
import { useScan, useScanStatus, useSearchStats } from '../api/client';
import { formatRelativeTime } from '../utils/format';
import { loadSkipDeepScanConfirm, saveSkipDeepScanConfirm } from '../utils/storage';
import type { Search } from '../types';

const SCAN_KIND_LABELS: Record<string, string> = {
  normal: 'швидкий',
  deep: 'глибокий',
  verify: 'перевірка',
};

const DEEP_SCAN_SECONDS_PER_REQUEST = 3;
const DEEP_SCAN_PAGE_LIMIT = 40;
const DEEP_SCAN_SAFETY_CAP = 50;

interface Props {
  search: Search;
}

/** Панель дій вибраного пошуку: статистика + кнопки скану з прогресом (Етап 2, B4). */
export function SearchActionPanel({ search }: Props) {
  const [scanKind, setScanKind] = useState<'normal' | 'deep' | null>(null);
  const [confirmDeepOpen, setConfirmDeepOpen] = useState(false);
  const scan = useScan();
  const { data: stats } = useSearchStats(search.id);
  const { data: status } = useScanStatus(search.id, scanKind != null);

  const isScanning = scanKind != null;
  const lastScan = stats?.last_scan;

  const deepScanRequests =
    search.visible_total_count != null
      ? Math.min(DEEP_SCAN_SAFETY_CAP, Math.ceil(search.visible_total_count / DEEP_SCAN_PAGE_LIMIT))
      : DEEP_SCAN_SAFETY_CAP;
  const deepScanMinutes = Math.max(
    1,
    Math.round((deepScanRequests * DEEP_SCAN_SECONDS_PER_REQUEST) / 60),
  );

  function startDeepScan() {
    if (loadSkipDeepScanConfirm()) {
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
          const description = deep
            ? `${r.requestsUsed} запитів · знайдено ${r.found} · нових ${r.new_count} · вимкнено ${r.disabled_count}`
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

  return (
    <Stack gap={2} px={4} py={3}>
      <Stack gap={0.5}>
        <Text textStyle="sm" color="fg.muted">
          {search.visible_total_count != null
            ? `На OLX: ${search.visible_total_count.toLocaleString('uk-UA')} · `
            : ''}
          У базі: {(stats?.in_db ?? 0).toLocaleString('uk-UA')} · Давно не бачених:{' '}
          {(stats?.stale_count ?? 0).toLocaleString('uk-UA')}
        </Text>
        {lastScan && (
          <HStack gap={1}>
            <Text textStyle="xs" color="fg.muted">
              Останній скан: {formatRelativeTime(lastScan.started_at)} (
              {SCAN_KIND_LABELS[lastScan.kind] ?? lastScan.kind}) · +{lastScan.new_count ?? 0}{' '}
              нових · {lastScan.disabled_count ?? 0} вимкнено
            </Text>
            {lastScan.error && (
              <Tooltip content={lastScan.error}>
                <Box as="span" color="orange.500" display="inline-flex">
                  <LuTriangleAlert />
                </Box>
              </Tooltip>
            )}
          </HStack>
        )}
      </Stack>
      <HStack gap={3} wrap="wrap" align="flex-start">
        <Stack gap={0.5}>
          <Button
            size="sm"
            colorPalette="blue"
            loading={scanKind === 'normal'}
            disabled={isScanning}
            onClick={() => runScan(false)}
          >
            <LuRefreshCw /> Швидкий скан
          </Button>
          <Text textStyle="xs" color="fg.muted">
            ~10 с · новинки зверху видачі
          </Text>
        </Stack>
        <Stack gap={0.5}>
          <Button
            size="sm"
            variant="outline"
            loading={scanKind === 'deep'}
            disabled={isScanning}
            onClick={startDeepScan}
          >
            <LuLayers /> Глибокий скан
          </Button>
          <Text textStyle="xs" color="fg.muted">
            ~1–2 хв · вся видача вглиб
          </Text>
        </Stack>
        <Stack gap={0.5}>
          <Tooltip content="Перевірка статусу старих оголошень — залежить від детектора неактивних сторінок (ще не реалізовано)">
            <Box as="span" display="inline-block">
              <Button size="sm" variant="outline" disabled>
                <LuStethoscope /> Перевірити неактивні ({stats?.stale_count ?? 0})
              </Button>
            </Box>
          </Tooltip>
          <Text textStyle="xs" color="fg.muted">
            ~1 хв · заходить на сторінки старих оголошень
          </Text>
        </Stack>
      </HStack>
      {isScanning && status && (
        <Box>
          <Progress.Root
            size="xs"
            colorPalette="blue"
            value={
              status.requests_total == null
                ? null
                : ((status.requests_done ?? 0) / status.requests_total) * 100
            }
          >
            <Progress.Track>
              <Progress.Range />
            </Progress.Track>
          </Progress.Root>
          <Text textStyle="xs" color="fg.muted" mt={0.5}>
            {status.requests_total == null
              ? 'Підготовка…'
              : `Запит ${status.requests_done ?? 0}/${status.requests_total} · ~${Math.round(
                  (status.requests_total - (status.requests_done ?? 0)) *
                    DEEP_SCAN_SECONDS_PER_REQUEST,
                )} с`}
          </Text>
        </Box>
      )}
      <ConfirmActionDialog
        open={confirmDeepOpen}
        onOpenChange={setConfirmDeepOpen}
        title="Запустити глибокий скан?"
        description={`Глибокий скан зробить до ~${deepScanRequests} запитів до OLX з паузами (~${deepScanMinutes} хв) і додасть у базу оголошення з глибини видачі. Продовжити?`}
        confirmLabel="Сканувати"
        onConfirm={(skipNextTime) => {
          if (skipNextTime) saveSkipDeepScanConfirm(true);
          runScan(true);
        }}
      />
    </Stack>
  );
}
