import { Box, Button } from '@chakra-ui/react';
import { LuRefreshCw } from 'react-icons/lu';
import { Tooltip } from '../../ui/tooltip';
import { SCAN_KIND_LABELS } from '../../../constants';
import type { ScanStatus } from '../../../types';

interface Props {
  scanKind: 'normal' | 'deep' | 'verify' | 'analyze';
  status: ScanStatus;
  /** Повернутись до згорнутого скану — відкриває модалку сканування. */
  onClick: () => void;
}

/**
 * Компактний індикатор активного скану в хедері — з'являється, коли модалку сканування згорнуто,
 * а скан ще йде (docs/plans/scan-progress-detail.md). Клік повертає модалку з тим самим прогресом.
 */
export function ScanStatusChip({ scanKind, status, onClick }: Props) {
  const progress =
    status.requests_total == null
      ? 'Підготовка…'
      : `${Math.round(((status.requests_done ?? 0) / status.requests_total) * 100)}%`;

  return (
    <Tooltip content="Повернутись до скану">
      <Button size="sm" variant="subtle" colorPalette="blue" onClick={onClick}>
        <Box as={LuRefreshCw} animation="spin 2s linear infinite" />
        {SCAN_KIND_LABELS[scanKind] ?? scanKind} · {progress}
      </Button>
    </Tooltip>
  );
}
