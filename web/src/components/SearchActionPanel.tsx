import { useState } from 'react';
import { Badge, Box, Button, HStack, Progress, SimpleGrid, Stack, Text } from '@chakra-ui/react';
import { LuActivity, LuLayers, LuRefreshCw, LuStethoscope, LuTriangleAlert } from 'react-icons/lu';
import { ConfirmActionDialog } from './ConfirmActionDialog';
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
/** Межа вікна пагінації GraphQL OLX (offset ≤ 1000) — дзеркалить MAX_PAGES у graphqlOlxFetcher.ts. */
const DEEP_SCAN_MAX_PAGES = 26;

interface Props {
  search: Search;
}

/** Панель дій вибраного пошуку у вигляді модального вікна: статистика + картки запуску сканування. */
export function SearchActionPanel({ search }: Props) {
  const [scanKind, setScanKind] = useState<'normal' | 'deep' | null>(null);
  const [confirmDeepOpen, setConfirmDeepOpen] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const scan = useScan();
  const { data: stats } = useSearchStats(search.id);
  const { data: status } = useScanStatus(search.id, scanKind != null);

  const isScanning = scanKind != null;
  const lastScan = stats?.last_scan;

  const deepScanRequests =
    search.visible_total_count != null
      ? Math.min(DEEP_SCAN_MAX_PAGES, Math.ceil(search.visible_total_count / DEEP_SCAN_PAGE_LIMIT))
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
            <SimpleGrid columns={3} gap={3}>
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
                    <Tooltip content={lastScan.error}>
                      <Badge colorPalette="red" variant="subtle">
                        <LuTriangleAlert /> Помилка
                      </Badge>
                    </Tooltip>
                  )}
                </HStack>
              </Box>
            )}

            {/* Рядок прогресу сканування */}
            {isScanning && status && (
              <Stack gap={1.5} p={3} rounded="lg" bg="blue.subtle/10" borderWidth="1px" borderColor="blue.subtle">
                <HStack justify="space-between">
                  <Text textStyle="xs" fontWeight="semibold" color="blue.fg">
                    Виконується {SCAN_KIND_LABELS[scanKind] ?? scanKind} скан...
                  </Text>
                  <Text textStyle="xs" color="fg.muted">
                    {status.requests_total == null
                      ? 'Підготовка…'
                      : `Запит ${status.requests_done ?? 0}/${status.requests_total}`}
                  </Text>
                </HStack>
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
                {status.requests_total != null && (
                  <Text textStyle="2xs" color="fg.muted" textAlign="right">
                    Залишилось: ~{Math.round(
                      (status.requests_total - (status.requests_done ?? 0)) *
                        DEEP_SCAN_SECONDS_PER_REQUEST,
                    )} с
                  </Text>
                )}
              </Stack>
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
                      Проходить всю видачу OLX вглиб (до {DEEP_SCAN_MAX_PAGES} запитів) для наповнення бази з нуля.
                    </Text>
                  </Stack>
                </HStack>
              </Button>

              {/* Перевірити неактивні */}
              <Tooltip content="Перевірка статусу старих оголошень — залежить від детектора неактивних сторінок (ще не реалізовано)">
                <Box
                  p={4}
                  rounded="xl"
                  borderWidth="1px"
                  borderColor="border.subtle"
                  bg="bg.panel"
                  textAlign="left"
                  opacity={0.5}
                  cursor="not-allowed"
                >
                  <HStack gap={4} align="start">
                    <Box p={2.5} rounded="lg" bg="gray.subtle" color="fg.muted">
                      <LuStethoscope />
                    </Box>
                    <Stack gap={1} flex="1">
                      <HStack justify="space-between" align="center">
                        <Text textStyle="sm" fontWeight="bold" color="fg.muted">
                          Перевірити неактивні
                        </Text>
                        <Badge size="sm" colorPalette="gray" variant="subtle">
                          ~1 хв
                        </Badge>
                      </HStack>
                      <Text textStyle="xs" color="fg.muted">
                        Заходить на сторінки застарілих оголошень ({stats?.stale_count ?? 0}), щоб оновити їх статус на OLX.
                      </Text>
                    </Stack>
                  </HStack>
                </Box>
              </Tooltip>
            </Stack>
          </Stack>
        </DialogBody>
      </DialogContent>

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
    </DialogRoot>
  );
}

