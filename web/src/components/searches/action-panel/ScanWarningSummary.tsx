import { useState } from 'react';
import { Accordion, Box, Button, HStack, IconButton, Stack, Text } from '@chakra-ui/react';
import type { IconType } from 'react-icons';
import {
  LuChevronDown,
  LuCopy,
  LuGlobe,
  LuInfo,
  LuLayers,
  LuListEnd,
  LuPowerOff,
  LuSplit,
  LuTags,
  LuTriangleAlert,
} from 'react-icons/lu';
import { copyToClipboard } from '../../../utils/clipboard';
import { parseScanWarning, type ScanNoteKind } from '../../../utils/scanWarning';

interface Props {
  warning: string;
  verifyCandidates: number;
}

const NOTE_ICON: Record<ScanNoteKind, IconType> = {
  'coverage-skipped': LuPowerOff,
  'cap-hit': LuTriangleAlert,
  'html-fallback': LuGlobe,
  'window-cap': LuListEnd,
  split: LuSplit,
  'multi-query': LuLayers,
  'no-price-bound': LuTags,
  generic: LuInfo,
};

const STAT_ICON: Record<'variants' | 'buckets', IconType> = {
  variants: LuLayers,
  buckets: LuTags,
};

/**
 * Людино-зрозуміле зведення `scan_runs.warning`: смужка стат-чипів + перекладені на наслідки
 * нотатки + згортний технічний рядок. Рендериться всередині помаранчевого блоку
 * «Попередження» (ActionPanelLastScan). Технічний словник — `utils/scanWarning.ts`.
 */
export function ScanWarningSummary({ warning, verifyCandidates }: Props) {
  const [rawOpen, setRawOpen] = useState(false);
  const { stats, notes, raw } = parseScanWarning(warning, { verifyCandidates });
  // Дієві нотатки розгорнуті одразу (вимагають уваги), інформаційні — згорнуті, щоб не захаращувати.
  const defaultOpen = notes.filter((n) => n.tone === 'attention').map((n) => n.kind);

  return (
    <Stack gap={3} mt={3}>
      {stats.length > 0 && (
        <HStack gap={2} wrap="wrap">
          {stats.map((stat) => {
            const Icon = STAT_ICON[stat.kind];
            return (
              <HStack
                key={stat.kind}
                gap={2}
                px={2.5}
                py={1.5}
                rounded="md"
                bg="warning.subtle"
                borderWidth="1px"
                borderColor="warning.muted"
              >
                <Box as={Icon} color="warning.fg" fontSize="sm" />
                <Stack gap={0} lineHeight="1">
                  <Text fontSize="md" fontWeight="bold" fontFamily="mono" color="warning.fg">
                    {stat.value}
                  </Text>
                  <Text fontSize="2xs" color="fg.muted" textTransform="uppercase" letterSpacing="wide">
                    {stat.label}
                  </Text>
                </Stack>
              </HStack>
            );
          })}
        </HStack>
      )}

      <Accordion.Root multiple collapsible defaultValue={defaultOpen} variant="plain">
        <Stack gap={1.5}>
          {notes.map((note) => {
            const Icon = NOTE_ICON[note.kind];
            const attention = note.tone === 'attention';
            return (
              <Accordion.Item key={note.kind} value={note.kind} borderWidth={0}>
                <Accordion.ItemTrigger
                  cursor="pointer"
                  px={0}
                  py={1}
                  gap={2.5}
                  _hover={{ opacity: 0.85 }}
                >
                  <Box
                    mt={0.5}
                    p={1.5}
                    rounded="md"
                    flexShrink={0}
                    display="inline-flex"
                    fontSize="sm"
                    bg={attention ? 'warning.subtle' : 'bg.muted'}
                    color={attention ? 'warning.fg' : 'fg.muted'}
                  >
                    <Icon />
                  </Box>
                  <Text fontSize="xs" fontWeight="semibold" color="fg.default" flex="1" textAlign="left">
                    {note.title}
                  </Text>
                  <Accordion.ItemIndicator>
                    <LuChevronDown />
                  </Accordion.ItemIndicator>
                </Accordion.ItemTrigger>
                <Accordion.ItemContent>
                  <Box pl={9} pb={1.5}>
                    <Text fontSize="xs" color="fg.muted" lineHeight="1.45">
                      {note.detail}
                    </Text>
                  </Box>
                </Accordion.ItemContent>
              </Accordion.Item>
            );
          })}
        </Stack>
      </Accordion.Root>

      <Box>
        <Button
          size="xs"
          variant="ghost"
          colorPalette="warning"
          onClick={() => setRawOpen((open) => !open)}
        >
          <Box
            as={LuChevronDown}
            transform={rawOpen ? 'rotate(180deg)' : undefined}
            transition="transform 0.15s ease"
          />
          Технічні деталі
        </Button>
        {rawOpen && (
          <Box mt={1} p={2} bg="bg.muted" rounded="md" position="relative">
            <IconButton
              aria-label="Скопіювати технічні деталі"
              size="xs"
              variant="ghost"
              colorPalette="warning"
              h={6}
              minW={6}
              position="absolute"
              top={1}
              right={1}
              onClick={() => copyToClipboard(raw)}
            >
              <LuCopy />
            </IconButton>
            <Text
              fontSize="2xs"
              fontFamily="mono"
              color="fg.muted"
              whiteSpace="pre-wrap"
              wordBreak="break-word"
              pr={7}
              maxH="120px"
              overflowY="auto"
            >
              {raw}
            </Text>
          </Box>
        )}
      </Box>
    </Stack>
  );
}
