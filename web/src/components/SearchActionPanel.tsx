import { useState } from 'react';
import { Badge, Box, Button, HStack, SimpleGrid, Stack, Text, IconButton } from '@chakra-ui/react';
import { LuActivity, LuLayers, LuRefreshCw, LuStethoscope, LuTriangleAlert, LuCopy } from 'react-icons/lu';
import { ConfirmActionDialog } from './ConfirmActionDialog';
import { ScanProgressPanel } from './ScanProgressPanel';
import {
  DialogBackdrop,
  DialogBody,
  DialogCloseTrigger,
  DialogContent,
  DialogHeader,
  DialogRoot,
  DialogTitle,
  DialogTrigger,
} from './ui/dialog';
import { Tooltip } from './ui/tooltip';
import { toaster } from './ui/toaster';
import { copyToClipboard } from '../utils/clipboard';
import { useScan, useScanStatus, useSearchStats, useVerify } from '../api';
import { formatRelativeTime } from '../utils/format';
import { loadSkipDeepScanConfirm, saveSkipDeepScanConfirm } from '../utils/storage';
import type { Search } from '../types';

export const SCAN_KIND_LABELS: Record<string, string> = {
  normal: 'швидкий',
  deep: 'глибокий',
  verify: 'перевірка',
};

const DEEP_SCAN_SECONDS_PER_REQUEST = 3;
const DEEP_SCAN_PAGE_LIMIT = 40;
/** Межа вікна пагінації GraphQL OLX (offset ≤ 1000) — дзеркалить MAX_PAGES у graphqlOlxFetcher.ts. */
const DEEP_SCAN_MAX_PAGES = 26;
/** Поріг розбиття по ціні (= вікно пагінації OLX) — дзеркалить SPLIT_THRESHOLD у graphqlOlxFetcher.ts. */
const DEEP_SCAN_SPLIT_THRESHOLD = 1000;

interface Props {
  search: Search;
}

/** Панель дій вибраного пошуку у вигляді модального вікна: статистика + картки запуску сканування. */
export function SearchActionPanel({ search }: Props) {
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

  // Великий пошук (> вікна) глибокий скан авто-розбиває на цінові діапазони
  // (docs/plans/price-range-split.md): кожен ≤ вікна, тож сумарно ~ceil(count/40) запитів
  // (а не cap 26). Малий пошук — один діапазон, як раніше (cap 26).
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
          const bucketsSuffix = r.bucketsUsed != null && r.bucketsUsed > 1 ? ` · діапазонів ${r.bucketsUsed}` : '';
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

  return (
    <DialogRoot
      open={dialogOpen}
      onOpenChange={(details) => setDialogOpen(details.open)}
      size="md"
      placement="center"
    >
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" colorPalette="blue">
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
            {/* Карточки статистики */}
            <SimpleGrid columns={{ base: 2, md: 3 }} gap={3}>
              <Box p={3} bg="bg.muted" rounded="lg" borderWidth="1px" borderColor="border.subtle" textAlign="center">
                <Text textStyle="xs" color="fg.muted" fontWeight="semibold">На OLX</Text>
                <Text textStyle="xl" fontWeight="bold" mt={1}>
                  {search.visible_total_count != null ? search.visible_total_count.toLocaleString('uk-UA') : '—'}
                </Text>
              </Box>
              <Box p={3} bg="bg.muted" rounded="lg" borderWidth="1px" borderColor="border.subtle" textAlign="center">
                <Text textStyle="xs" color="fg.muted" fontWeight="semibold">У базі</Text>
                <Text textStyle="xl" fontWeight="bold" mt={1} color="blue.fg">
                  {(stats?.in_db ?? 0).toLocaleString('uk-UA')}
                </Text>
              </Box>
              <Box p={3} bg="bg.muted" rounded="lg" borderWidth="1px" borderColor="border.subtle" textAlign="center">
                <Text textStyle="xs" color="fg.muted" fontWeight="semibold">Зниклі/Старі</Text>
                <Text textStyle="xl" fontWeight="bold" mt={1} color="orange.fg">
                  {(stats?.stale_count ?? 0).toLocaleString('uk-UA')}
                </Text>
              </Box>
            </SimpleGrid>

            {/* Останній скан */}
            {lastScan && (
              <Box
                p={3}
                rounded="lg"
                borderWidth="1px"
                borderColor={lastScan.error ? 'red.subtle' : 'border.subtle'}
                bg={lastScan.error ? 'red.subtle/10' : 'bg.subtle'}
              >
                <HStack justify="space-between" align="start">
                  <Stack gap={0.5}>
                    <Text textStyle="xs" color="fg.muted" fontWeight="medium">
                      Останній скан: {formatRelativeTime(lastScan.started_at)}
                    </Text>
                    <Text textStyle="xs" color="fg.default">
                      Тип: {SCAN_KIND_LABELS[lastScan.kind] ?? lastScan.kind} • Знайдено: +{lastScan.new_count ?? 0} нових • Вимкнено: {lastScan.disabled_count ?? 0}
                    </Text>
                  </Stack>
                  {lastScan.error && (
                    <Badge colorPalette="red" variant="subtle">
                      <LuTriangleAlert /> Помилка
                    </Badge>
                  )}
                </HStack>
                {lastScan.error && (
                  <Box mt={3} p={2} bg="red.muted" rounded="md" position="relative">
                    <HStack justify="space-between" mb={1}>
                      <Text textStyle="xs" fontWeight="bold" color="red.fg">Деталі помилки:</Text>
                      <IconButton
                        size="xs"
                        variant="ghost"
                        colorPalette="red"
                        h={6}
                        minW={6}
                        onClick={() => copyToClipboard(lastScan.error!)}
                      >
                        <LuCopy />
                      </IconButton>
                    </HStack>
                    <Text textStyle="xs" color="red.fg" whiteSpace="pre-wrap" wordBreak="break-word" maxH="150px" overflowY="auto">
                      {lastScan.error}
                    </Text>
                  </Box>
                )}
              </Box>
            )}

            {/* Деталізований прогрес сканування (docs/plans/scan-progress-detail.md) */}
            {isScanning && status && scanKind && (
              <ScanProgressPanel
                scanKind={scanKind}
                status={status}
                secondsPerRequest={DEEP_SCAN_SECONDS_PER_REQUEST}
              />
            )}

            {/* Дії */}
            <Stack gap={3}>
              <Text textStyle="xs" fontWeight="semibold" color="fg.muted" textTransform="uppercase" letterSpacing="wider">
                Доступні дії
              </Text>

              {/* Швидкий скан */}
              <Button
                variant="ghost"
                onClick={() => !isScanning && runScan(false)}
                disabled={isScanning}
                p={4}
                rounded="xl"
                borderWidth="1px"
                borderColor="border.subtle"
                bg="bg.panel"
                justifyContent="flex-start"
                alignItems="flex-start"
                height="auto"
                whiteSpace="normal"
                w="full"
                fontWeight="normal"
                _hover={!isScanning ? { bg: 'bg.muted', borderColor: 'blue.muted', transform: 'translateY(-1px)' } : undefined}
                _active={!isScanning ? { transform: 'translateY(0)' } : undefined}
                cursor={isScanning ? 'not-allowed' : 'pointer'}
                opacity={isScanning && scanKind !== 'normal' ? 0.5 : 1}
                transition="all 0.2s"
              >
                <HStack gap={4} align="start" w="full">
                  <Box p={2.5} rounded="lg" bg="blue.subtle" color="blue.fg" flexShrink={0}>
                    <Box as={LuRefreshCw} animation={isScanning && scanKind === 'normal' ? 'spin 2s linear infinite' : undefined} />
                  </Box>
                  <Stack gap={1} flex="1" textAlign="left">
                    <HStack justify="space-between" align="center" w="full">
                      <Text textStyle="sm" fontWeight="bold" color="fg.default">
                        Швидкий скан
                      </Text>
                      <Badge size="sm" colorPalette="blue" variant="subtle">
                        ~10 с
                      </Badge>
                    </HStack>
                    <Text textStyle="xs" color="fg.muted" whiteSpace="normal">
                      Перевіряє лише першу сторінку видачі для швидкого пошуку останніх оголошень.
                    </Text>
                  </Stack>
                </HStack>
              </Button>

              {/* Глибокий скан */}
              <Button
                variant="ghost"
                onClick={() => !isScanning && startDeepScan()}
                disabled={isScanning}
                p={4}
                rounded="xl"
                borderWidth="1px"
                borderColor="border.subtle"
                bg="bg.panel"
                justifyContent="flex-start"
                alignItems="flex-start"
                height="auto"
                whiteSpace="normal"
                w="full"
                fontWeight="normal"
                _hover={!isScanning ? { bg: 'bg.muted', borderColor: 'purple.muted', transform: 'translateY(-1px)' } : undefined}
                _active={!isScanning ? { transform: 'translateY(0)' } : undefined}
                cursor={isScanning ? 'not-allowed' : 'pointer'}
                opacity={isScanning && scanKind !== 'deep' ? 0.5 : 1}
                transition="all 0.2s"
              >
                <HStack gap={4} align="start" w="full">
                  <Box p={2.5} rounded="lg" bg="purple.subtle" color="purple.fg" flexShrink={0}>
                    <Box as={LuLayers} animation={isScanning && scanKind === 'deep' ? 'pulse 2s infinite' : undefined} />
                  </Box>
                  <Stack gap={1} flex="1" textAlign="left">
                    <HStack justify="space-between" align="center" w="full">
                      <Text textStyle="sm" fontWeight="bold" color="fg.default">
                        Глибокий скан
                      </Text>
                      <Badge size="sm" colorPalette="purple" variant="subtle">
                        ~1–2 хв
                      </Badge>
                    </HStack>
                    <Text textStyle="xs" color="fg.muted" whiteSpace="normal">
                      {willSplit
                        ? `Проходить всю видачу OLX вглиб із авто-розбиттям на ~${deepScanBuckets} цінових діапазони (~${deepScanRequests} запитів) для повного покриття.`
                        : `Проходить всю видачу OLX вглиб (до ${DEEP_SCAN_MAX_PAGES} запитів) для наповнення бази з нуля.`}
                    </Text>
                  </Stack>
                </HStack>
              </Button>

              {/* Перевірити неактивні */}
              <Button
                variant="ghost"
                onClick={() => !isScanning && verifyCandidates > 0 && runVerifyPass()}
                disabled={isScanning || verifyCandidates === 0}
                p={4}
                rounded="xl"
                borderWidth="1px"
                borderColor="border.subtle"
                bg="bg.panel"
                justifyContent="flex-start"
                alignItems="flex-start"
                height="auto"
                whiteSpace="normal"
                w="full"
                fontWeight="normal"
                _hover={
                  !isScanning && verifyCandidates > 0
                    ? { bg: 'bg.muted', borderColor: 'teal.muted', transform: 'translateY(-1px)' }
                    : undefined
                }
                _active={!isScanning && verifyCandidates > 0 ? { transform: 'translateY(0)' } : undefined}
                cursor={isScanning || verifyCandidates === 0 ? 'not-allowed' : 'pointer'}
                opacity={(isScanning && scanKind !== 'verify') || verifyCandidates === 0 ? 0.5 : 1}
                transition="all 0.2s"
              >
                <HStack gap={4} align="start" w="full">
                  <Box p={2.5} rounded="lg" bg="teal.subtle" color="teal.fg" flexShrink={0}>
                    <Box as={LuStethoscope} animation={isScanning && scanKind === 'verify' ? 'pulse 2s infinite' : undefined} />
                  </Box>
                  <Stack gap={1} flex="1" textAlign="left">
                    <HStack justify="space-between" align="center" w="full">
                      <Text textStyle="sm" fontWeight="bold" color="fg.default">
                        Перевірити неактивні
                      </Text>
                      <Badge size="sm" colorPalette="teal" variant="subtle">
                        ~1 хв
                      </Badge>
                    </HStack>
                    <Text textStyle="xs" color="fg.muted" whiteSpace="normal">
                      Перевіряє сторінки давно не бачених оголошень і дозаповнює опис/продавця ({verifyCandidates}, до 50 сторінок за прохід).
                    </Text>
                  </Stack>
                </HStack>
              </Button>
            </Stack>
          </Stack>
        </DialogBody>
      </DialogContent>

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
          if (skipNextTime) saveSkipDeepScanConfirm(true);
          runScan(true);
        }}
      />
    </DialogRoot>
  );
}

