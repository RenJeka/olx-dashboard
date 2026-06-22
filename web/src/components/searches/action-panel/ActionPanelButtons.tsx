import { Badge, Box, Button, HStack, Stack, Text } from '@chakra-ui/react';
import { LuChartNoAxesCombined, LuLayers, LuRefreshCw, LuStethoscope } from 'react-icons/lu';
import { DEEP_SCAN_MAX_PAGES } from '../../../constants';

interface Props {
  isScanning: boolean;
  scanKind: 'normal' | 'deep' | 'verify' | 'analyze' | null;
  verifyCandidates: number;
  willSplit: boolean;
  deepScanBuckets: number;
  deepScanRequests: number;
  deepScanMinutes: number;
  onRunQuickScan: () => void;
  onStartDeepScan: () => void;
  onRunVerifyPass: () => void;
  onStartAnalysis: () => void;
}

/** Блок кнопок запуску сканування та перевірки неактивних. */
export function ActionPanelButtons({
  isScanning,
  scanKind,
  verifyCandidates,
  willSplit,
  deepScanBuckets,
  deepScanRequests,
  deepScanMinutes,
  onRunQuickScan,
  onStartDeepScan,
  onRunVerifyPass,
  onStartAnalysis,
}: Props) {
  return (
    <Stack gap={3}>
      <Text textStyle="xs" fontWeight="semibold" color="fg.muted" textTransform="uppercase" letterSpacing="wider">
        Доступні дії
      </Text>

      {/* Аналіз перед сканом — лише зондування + звіт, без допагінації (docs/plans/two-phase-deep-scan.md) */}
      <Button
        variant="ghost"
        onClick={() => !isScanning && onStartAnalysis()}
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
        _hover={!isScanning ? { bg: 'bg.muted', borderColor: 'warning.muted', transform: 'translateY(-1px)' } : undefined}
        _active={!isScanning ? { transform: 'translateY(0)' } : undefined}
        cursor={isScanning ? 'not-allowed' : 'pointer'}
        opacity={isScanning && scanKind !== 'analyze' ? 0.5 : 1}
        transition="all 0.2s"
      >
        <HStack gap={4} align="start" w="full">
          <Box p={2.5} rounded="lg" bg="warning.subtle" color="warning.fg" flexShrink={0}>
            <Box as={LuChartNoAxesCombined} animation={isScanning && scanKind === 'analyze' ? 'pulse 2s infinite' : undefined} />
          </Box>
          <Stack gap={1} flex="1" textAlign="left">
            <HStack justify="space-between" align="center" w="full">
              <Text textStyle="sm" fontWeight="bold" color="fg.default">
                Аналіз перед сканом
              </Text>
              <Badge size="sm" colorPalette="warning" variant="subtle">
                до 2–3 хв
              </Badge>
            </HStack>
            <Text textStyle="xs" color="fg.muted" whiteSpace="normal">
              Зондує видачу та цінові діапазони, показує точний звіт із ETA — і лише тоді
              запускає повний глибокий скан, якщо ви підтвердите.
            </Text>
          </Stack>
        </HStack>
      </Button>

      {/* Швидкий скан */}
      <Button
        variant="ghost"
        onClick={() => !isScanning && onRunQuickScan()}
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
        _hover={!isScanning ? { bg: 'bg.muted', borderColor: 'accent.muted', transform: 'translateY(-1px)' } : undefined}
        _active={!isScanning ? { transform: 'translateY(0)' } : undefined}
        cursor={isScanning ? 'not-allowed' : 'pointer'}
        opacity={isScanning && scanKind !== 'normal' ? 0.5 : 1}
        transition="all 0.2s"
      >
        <HStack gap={4} align="start" w="full">
          <Box p={2.5} rounded="lg" bg="accent.subtle" color="accent.fg" flexShrink={0}>
            <Box as={LuRefreshCw} animation={isScanning && scanKind === 'normal' ? 'spin 2s linear infinite' : undefined} />
          </Box>
          <Stack gap={1} flex="1" textAlign="left">
            <HStack justify="space-between" align="center" w="full">
              <Text textStyle="sm" fontWeight="bold" color="fg.default">
                Швидкий скан
              </Text>
              <Badge size="sm" colorPalette="accent" variant="subtle">
                до 2–3 хв
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
        onClick={() => !isScanning && onStartDeepScan()}
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
                до 10 хв
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
        onClick={() => !isScanning && verifyCandidates > 0 && onRunVerifyPass()}
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
                ~2–3 хв
              </Badge>
            </HStack>
            <Text textStyle="xs" color="fg.muted" whiteSpace="normal">
              Перевіряє сторінки давно не бачених оголошень і дозаповнює опис/продавця ({verifyCandidates}, до 50 сторінок за прохід).
            </Text>
          </Stack>
        </HStack>
      </Button>
    </Stack>
  );
}
