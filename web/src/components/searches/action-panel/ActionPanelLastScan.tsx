import { Badge, Box, HStack, IconButton, Stack, Text } from '@chakra-ui/react';
import { LuCopy, LuTriangleAlert } from 'react-icons/lu';
import { formatRelativeTime } from '../../../utils/format';
import { copyToClipboard } from '../../../utils/clipboard';
import { SCAN_KIND_LABELS } from '../../../constants';
import type { LastScanInfo } from '../../../types';

interface Props {
  lastScan: LastScanInfo | null | undefined;
}

/** Блок з інформацією про останній скан (дата, тип, знайдено, помилки). */
export function ActionPanelLastScan({ lastScan }: Props) {
  if (!lastScan) return null;

  return (
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
  );
}
