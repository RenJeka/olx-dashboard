import {
  Badge,
  Box,
  Button,
  HStack,
  Image,
  Stack,
  Table,
  Text,
  Wrap,
} from '@chakra-ui/react';
import { LuFileSpreadsheet, LuFileJson } from 'react-icons/lu';
import { DescriptionTooltip } from '../../table/DescriptionTooltip';
import { HighlightText } from '../../table/HighlightText';
import { Tooltip } from '../../ui/tooltip';
import { stripDescriptionHtml } from '../../../utils/format';
import { useIsMobile } from '../../../hooks/useIsMobile';
import type { useWizard } from '../../../hooks/analysis/useWizard';
import type { AnalyzedListing, Listing } from '../../../types';

type Actions = ReturnType<typeof useWizard>;

interface Props {
  w: Actions;
}

// ── Допоміжні render-фрагменти ──────────────────────────────

function PhotoTitle({ listing, fallbackId }: { listing: Listing | undefined; fallbackId: number }) {
  return (
    <HStack gap={2} align="start">
      {listing?.photo_url ? (
        <Image src={listing.photo_url} alt="" boxSize={12} rounded="md" objectFit="cover" flexShrink={0} />
      ) : (
        <Box boxSize={12} rounded="md" bg="bg.muted" flexShrink={0} />
      )}
      <Text fontWeight="semibold" fontSize="sm" lineClamp={2}>
        {listing?.title ?? `#${fallbackId}`}
      </Text>
    </HStack>
  );
}

function DescriptionBlock({
  listing, desc, evidence, isMobile, onClickDescription,
}: {
  listing: Listing | undefined;
  desc: string;
  evidence: string[];
  isMobile: boolean;
  onClickDescription: (l: Listing) => void;
}) {
  return (
    <DescriptionTooltip
      description={listing?.description ?? null}
      query={evidence}
      onClick={() => listing && onClickDescription(listing)}
    >
      <Text textStyle="xs" color="fg.muted" lineClamp={isMobile ? 4 : 3} whiteSpace="pre-line">
        <HighlightText text={desc} query={evidence} />
      </Text>
    </DescriptionTooltip>
  );
}

function CriteriaTags({
  row, mode, isIncluded, toggleIncluded,
}: {
  row: AnalyzedListing;
  mode: 'cons' | 'pros';
  isIncluded: Actions['isIncluded'];
  toggleIncluded: Actions['toggleIncluded'];
}) {
  return (
    <Wrap gap={1}>
      {row.items.map((it, i) => {
        const included = isIncluded(row.id, it);
        return (
          <Tooltip key={i} content={it.evidence} disabled={!it.evidence}>
            <Badge
              colorPalette={included ? (mode === 'cons' ? 'red' : 'green') : 'gray'}
              variant={included ? 'subtle' : 'outline'}
              textDecoration={included ? undefined : 'line-through'}
              borderWidth={it.ok ? undefined : '1px'}
              borderStyle={it.ok ? undefined : 'dashed'}
              cursor="pointer"
              role="button"
              tabIndex={0}
              onClick={() => toggleIncluded(row.id, it)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') toggleIncluded(row.id, it);
              }}
            >
              {it.criterion}
            </Badge>
          </Tooltip>
        );
      })}
    </Wrap>
  );
}

// ── Основний компонент ──────────────────────────────────────

/** Крок 3: перевірка знайдених збігів (таблиця / мобільні картки). */
export function ReviewStep({ w }: Props) {
  const isMobile = useIsMobile();
  const {
    mode, modeLabel, listingById,
    visibleRows, hiddenCount, accumulated,
    isIncluded, toggleIncluded,
    setOpenDescriptionListing,
    handleExport,
    setStep,
  } = w;

  function renderRow(r: AnalyzedListing) {
    const l = listingById.get(r.id);
    const desc = stripDescriptionHtml(l?.description ?? null);
    const includedEvidence = r.items
      .filter((it) => isIncluded(r.id, it))
      .map((it) => it.evidence);

    return { l, desc, includedEvidence };
  }

  return (
    <Stack gap={4}>
      <HStack justify="space-between" wrap="wrap" gap={2}>
        <Stack gap={0}>
          <Text textStyle="sm" color="fg.muted">
            Перевір знайдені {modeLabel.toLowerCase()}. Клікни на тег, щоб включити/виключити з результату.
          </Text>
          <Text textStyle="xs" color="fg.subtle">
            Показано {visibleRows.length} із {accumulated.length}
            {hiddenCount > 0 && ` (приховано ${hiddenCount} без результатів)`}
          </Text>
        </Stack>
        <HStack gap={2}>
          <Button size="xs" variant="outline" onClick={() => handleExport('xlsx')}>
            <LuFileSpreadsheet /> Excel
          </Button>
          <Button size="xs" variant="outline" onClick={() => handleExport('json')}>
            <LuFileJson /> JSON
          </Button>
        </HStack>
      </HStack>

      {isMobile ? (
        <Stack gap={3} maxH="60vh" overflowY="auto">
          {visibleRows.map((r) => {
            const { l, desc, includedEvidence } = renderRow(r);
            return (
              <Box key={r.id} p={3} borderWidth="1px" borderColor="border.subtle" rounded="md">
                <Stack gap={2}>
                  <PhotoTitle listing={l} fallbackId={r.id} />
                  <DescriptionBlock
                    listing={l}
                    desc={desc}
                    evidence={includedEvidence}
                    isMobile={isMobile}
                    onClickDescription={setOpenDescriptionListing}
                  />
                  <CriteriaTags row={r} mode={mode} isIncluded={isIncluded} toggleIncluded={toggleIncluded} />
                </Stack>
              </Box>
            );
          })}
        </Stack>
      ) : (
        <Box maxH="50vh" overflowY="auto" borderWidth="1px" borderColor="border.subtle" rounded="md">
          <Table.Root size="sm" css={{ tableLayout: 'fixed' }}>
            <Table.Header>
              <Table.Row>
                <Table.ColumnHeader position="sticky" top={0} zIndex={1} bg="bg" width="220px">
                  Оголошення
                </Table.ColumnHeader>
                <Table.ColumnHeader position="sticky" top={0} zIndex={1} bg="bg" width="50%">
                  Опис
                </Table.ColumnHeader>
                <Table.ColumnHeader position="sticky" top={0} zIndex={1} bg="bg">
                  {modeLabel}
                </Table.ColumnHeader>
              </Table.Row>
            </Table.Header>
            <Table.Body>
              {visibleRows.map((r) => {
                const { l, desc, includedEvidence } = renderRow(r);
                return (
                  <Table.Row key={r.id}>
                    <Table.Cell verticalAlign="top">
                      <PhotoTitle listing={l} fallbackId={r.id} />
                    </Table.Cell>
                    <Table.Cell verticalAlign="top" whiteSpace="normal">
                      <DescriptionBlock
                        listing={l}
                        desc={desc}
                        evidence={includedEvidence}
                        isMobile={isMobile}
                        onClickDescription={setOpenDescriptionListing}
                      />
                    </Table.Cell>
                    <Table.Cell verticalAlign="top">
                      <CriteriaTags row={r} mode={mode} isIncluded={isIncluded} toggleIncluded={toggleIncluded} />
                    </Table.Cell>
                  </Table.Row>
                );
              })}
            </Table.Body>
          </Table.Root>
        </Box>
      )}

      <HStack justify="space-between">
        <Button variant="ghost" onClick={() => setStep(2)}>
          Назад
        </Button>
        <Button colorPalette="blue" onClick={() => setStep(4)}>
          Далі: вставка
        </Button>
      </HStack>
    </Stack>
  );
}
