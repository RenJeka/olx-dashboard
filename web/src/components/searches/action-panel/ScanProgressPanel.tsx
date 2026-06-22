import { Badge, Box, Button, HStack, Progress, Stack, Text } from '@chakra-ui/react';
import { LuCircleStop, LuInfo, LuPause } from 'react-icons/lu';
import { SCAN_KIND_LABELS } from '../../../constants';
import { Tooltip } from '../../ui/tooltip';
import type { ScanStatus } from '../../../types';
/** Сегменти показуємо лише до цієї кількості — більше (напр. до 40 цінових бакетів) злилося б у кашу. */
const MAX_SEGMENTS = 16;

/**
 * Безпечний відсоток для Progress.Root: `total<=0` (зокрема 0, не лише null) або
 * нечислове `done/total` інакше дають NaN/Infinity — Zag кидає (НЕ console.warn, а
 * Uncaught Error) "[progress] The value passed `NaN` exceeds the max value `100`",
 * що зависає поза React render (через notifyManager) і блокує всю сторінку overlay'єм Vite.
 */
function safePercent(done: number | null | undefined, total: number | null | undefined): number | null {
  if (total == null || total <= 0) return null;
  const pct = (Math.max(0, done ?? 0) / total) * 100;
  return Number.isFinite(pct) ? Math.min(100, Math.max(0, pct)) : null;
}

interface Props {
  scanKind: 'normal' | 'deep' | 'verify' | 'analyze';
  status: ScanStatus;
  /** Секунд на один запит — для оцінки "Залишилось: ~N с" (узгоджено з SearchActionPanel). */
  secondsPerRequest: number;
  /** Зупинити скан — зібране збережеться (docs/plans/deep-scan-stop-and-history.md). */
  onStop: () => void;
  /** Запит на зупинку вже надіслано (кнопка показує «Зупиняється…»). */
  isStopping: boolean;
}

/**
 * Деталізований прогрес скану (docs/plans/scan-progress-detail.md): заголовок (тип + метод) →
 * рядок поточного етапу → сегментована "смуга подорожі" (один сегмент = одна реальна
 * підодиниця роботи: варіант синоніма / ціновий бакет / фаза verify) → загальний бар
 * запитів + ETA. Сегменти/stage рендеряться лише коли є реальні дані з бекенду — для
 * простого однозапитового скану панель виглядає так само, як і раніше.
 */
export function ScanProgressPanel({ scanKind, status, secondsPerRequest, onStop, isStopping }: Props) {
  const showSegments = status.sub_total != null && status.sub_total > 1;
  const segmented = showSegments && status.sub_total! <= MAX_SEGMENTS;

  return (
    <Stack gap={1.5} p={3} rounded="lg" bg="blue.subtle/10" borderWidth="1px" borderColor="blue.subtle" colorPalette="blue">
      <HStack justify="space-between">
        <HStack gap={2}>
          <Text textStyle="xs" fontWeight="semibold" color="blue.fg">
            Виконується {SCAN_KIND_LABELS[scanKind] ?? scanKind} скан…
          </Text>
          {status.fetch_method && (
            <Badge size="xs" colorPalette="blue" variant="subtle">
              {status.fetch_method}
            </Badge>
          )}
        </HStack>
        <Text textStyle="xs" color="fg.muted">
          {status.requests_total == null || status.requests_total <= 0
            ? 'Підготовка…'
            : `Запит ${status.requests_done ?? 0}/${status.requests_total}`}
        </Text>
      </HStack>

      {/* Лічильник етапів — завжди видимий, не перетирається транзієнтним stage (напр. паузою).
          Сам stage (у т.ч. текст паузи) показуємо іконкою з тултіпом правіше, щоб обидва
          шматки інформації були видні одночасно (docs/plans/scan-progress-detail.md). */}
      {status.sub_total != null ? (
        <HStack justify="space-between" align="center">
          <Text textStyle="2xs" color="fg.muted">
            Етап {status.sub_done ?? 0} з {status.sub_total}
          </Text>
          {status.stage && (
            <Tooltip content={status.stage} positioning={{ placement: 'top' }}>
              <Box
                as={status.stage.includes('Пауза') ? LuPause : LuInfo}
                color="fg.muted"
                boxSize={3.5}
                flexShrink={0}
                cursor="default"
              />
            </Tooltip>
          )}
        </HStack>
      ) : (
        status.stage && (
          <Text textStyle="2xs" color="fg.muted" lineClamp={1}>
            {status.stage}
          </Text>
        )
      )}

      {showSegments && (
        segmented ? (
          <HStack gap={1} w="full" aria-label={`Етап ${status.sub_done ?? 0} з ${status.sub_total}`}>
            {Array.from({ length: status.sub_total! }, (_, idx) => {
              const isDone = idx < (status.sub_done ?? 0) - 1;
              const isCurrent = idx === (status.sub_done ?? 0) - 1;
              return (
                <Box
                  key={idx}
                  flex="1"
                  h="6px"
                  rounded="full"
                  transition="background 0.3s"
                  bg={isDone || isCurrent ? 'colorPalette.solid' : 'bg.muted'}
                  borderWidth={isDone || isCurrent ? undefined : '1px'}
                  borderColor={isDone || isCurrent ? undefined : 'border.subtle'}
                  animation={isCurrent ? 'pulse 1.6s ease-in-out infinite' : undefined}
                  _motionReduce={{ animation: 'none' }}
                />
              );
            })}
          </HStack>
        ) : (
          <Progress.Root
            size="xs"
            colorPalette="blue"
            value={safePercent(status.sub_done, status.sub_total)}
          >
            <Progress.Track>
              <Progress.Range />
            </Progress.Track>
          </Progress.Root>
        )
      )}

      <Progress.Root
        size="xs"
        colorPalette="blue"
        value={safePercent(status.requests_done, status.requests_total)}
      >
        <Progress.Track>
          <Progress.Range />
        </Progress.Track>
      </Progress.Root>
      {status.requests_total != null && status.requests_total > 0 && (
        <Text textStyle="2xs" color="fg.muted" textAlign="right">
          Залишилось: ~{Math.max(0, Math.round((status.requests_total - (status.requests_done ?? 0)) * secondsPerRequest))} с
        </Text>
      )}

      <Button
        size="xs"
        variant="outline"
        colorPalette="red"
        alignSelf="flex-end"
        onClick={onStop}
        disabled={isStopping}
        loading={isStopping}
        loadingText="Зупиняється…"
      >
        <LuCircleStop /> Зупинити
      </Button>
    </Stack>
  );
}
