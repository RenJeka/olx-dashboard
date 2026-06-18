import { Badge, Box, HStack, Progress, Stack, Text } from '@chakra-ui/react';
import { SCAN_KIND_LABELS } from './SearchActionPanel';
import type { ScanStatus } from '../types';

/** Сегменти показуємо лише до цієї кількості — більше (напр. до 40 цінових бакетів) злилося б у кашу. */
const MAX_SEGMENTS = 16;

interface Props {
  scanKind: 'normal' | 'deep' | 'verify';
  status: ScanStatus;
  /** Секунд на один запит — для оцінки "Залишилось: ~N с" (узгоджено з SearchActionPanel). */
  secondsPerRequest: number;
}

/**
 * Деталізований прогрес скану (docs/plans/scan-progress-detail.md): заголовок (тип + метод) →
 * рядок поточного етапу → сегментована "смуга подорожі" (один сегмент = одна реальна
 * підодиниця роботи: варіант синоніма / ціновий бакет / фаза verify) → загальний бар
 * запитів + ETA. Сегменти/stage рендеряться лише коли є реальні дані з бекенду — для
 * простого однозапитового скану панель виглядає так само, як і раніше.
 */
export function ScanProgressPanel({ scanKind, status, secondsPerRequest }: Props) {
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
          {status.requests_total == null
            ? 'Підготовка…'
            : `Запит ${status.requests_done ?? 0}/${status.requests_total}`}
        </Text>
      </HStack>

      {status.stage && (
        <Text textStyle="2xs" color="fg.muted" lineClamp={1}>
          {status.stage}
        </Text>
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
          <Stack gap={0.5}>
            <Progress.Root
              size="xs"
              colorPalette="blue"
              value={((status.sub_done ?? 0) / status.sub_total!) * 100}
            >
              <Progress.Track>
                <Progress.Range />
              </Progress.Track>
            </Progress.Root>
            <Text textStyle="2xs" color="fg.muted" textAlign="right">
              {status.sub_done ?? 0}/{status.sub_total}
            </Text>
          </Stack>
        )
      )}

      <Progress.Root
        size="xs"
        colorPalette="blue"
        value={status.requests_total == null ? null : ((status.requests_done ?? 0) / status.requests_total) * 100}
      >
        <Progress.Track>
          <Progress.Range />
        </Progress.Track>
      </Progress.Root>
      {status.requests_total != null && (
        <Text textStyle="2xs" color="fg.muted" textAlign="right">
          Залишилось: ~{Math.round((status.requests_total - (status.requests_done ?? 0)) * secondsPerRequest)} с
        </Text>
      )}
    </Stack>
  );
}
