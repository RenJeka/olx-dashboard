import { Badge, Box, HStack, IconButton, Stack, Text } from '@chakra-ui/react';
import { LuCircleAlert, LuCopy, LuTriangleAlert } from 'react-icons/lu';
import { formatRelativeTime } from '../../../utils/format';
import { copyToClipboard } from '../../../utils/clipboard';
import { SCAN_KIND_LABELS } from '../../../constants';
import type { LastScanInfo } from '../../../types';
import { ScanWarningSummary } from './ScanWarningSummary';

interface Props {
  lastScan: LastScanInfo | null | undefined;
  verifyCandidates: number;
}

/**
 * Блок з інформацією про останній скан (дата, тип, знайдено, помилки/попередження).
 * `error` (червоне) — реальний збій скану, показуємо raw-текст винятку. `warning` (amber) —
 * частковий успіх: розбираємо у людино-зрозуміле зведення (`ScanWarningSummary`).
 */
export function ActionPanelLastScan({ lastScan, verifyCandidates }: Props) {
  if (!lastScan) return null;

  // Помилка має пріоритет над попередженням (на практиці взаємовиключні).
  const palette = lastScan.error ? 'danger' : lastScan.warning ? 'warning' : null;

  return (
    <Box
      p={3}
      rounded="lg"
      borderWidth="1px"
      borderColor={palette ? `${palette}.subtle` : 'border.subtle'}
      bg={palette ? `${palette}.subtle/10` : 'bg.subtle'}
    >
      <HStack justify="space-between" align="start">
        <Stack gap={0.5}>
          <Text textStyle="xs" color="fg.muted" fontWeight="medium">
            Останній скан: {formatRelativeTime(lastScan.started_at)}
          </Text>
          <Text textStyle="xs" color="fg.default">
            Тип: {SCAN_KIND_LABELS[lastScan.kind] ?? lastScan.kind} • Знайдено: +{lastScan.new_count ?? 0} нових • Вимкнено: {lastScan.disabled_count ?? 0}
          </Text>
          {lastScan.raw_found != null && lastScan.found != null && lastScan.raw_found > lastScan.found && (
            <Text textStyle="2xs" color="fg.muted">
              Унікальних: {lastScan.found} • сирих: {lastScan.raw_found} • злито дублів: {lastScan.raw_found - lastScan.found}
            </Text>
          )}
        </Stack>
        {lastScan.error && (
          <Badge colorPalette="danger" variant="subtle">
            <LuTriangleAlert /> Помилка
          </Badge>
        )}
        {!lastScan.error && lastScan.warning && (
          <Badge colorPalette="warning" variant="subtle">
            <LuCircleAlert /> Попередження
          </Badge>
        )}
      </HStack>

      {lastScan.error && (
        <Box mt={3} p={2} bg="danger.muted" rounded="md" position="relative">
          <HStack justify="space-between" mb={1}>
            <Text textStyle="xs" fontWeight="bold" color="danger.fg">Деталі помилки:</Text>
            <IconButton
              aria-label="Скопіювати деталі помилки"
              size="xs"
              variant="ghost"
              colorPalette="danger"
              h={6}
              minW={6}
              onClick={() => copyToClipboard(lastScan.error!)}
            >
              <LuCopy />
            </IconButton>
          </HStack>
          <Text textStyle="xs" color="danger.fg" whiteSpace="pre-wrap" wordBreak="break-word" maxH="150px" overflowY="auto">
            {lastScan.error}
          </Text>
        </Box>
      )}

      {!lastScan.error && lastScan.warning && (
        <ScanWarningSummary warning={lastScan.warning} verifyCandidates={verifyCandidates} />
      )}
    </Box>
  );
}
