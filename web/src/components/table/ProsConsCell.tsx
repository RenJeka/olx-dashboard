import { useState } from 'react';
import { Box, Button, HStack, Popover, Portal, Text, Textarea } from '@chakra-ui/react';
import { LuSparkles, LuThumbsDown, LuThumbsUp, LuTriangleAlert } from 'react-icons/lu';
import { useUpdateListing } from '../../api';
import { Tooltip } from '../ui/tooltip';
import { formatDate } from '../../utils/format';
import { ANALYSIS_SOURCE } from '../../constants';
import type { Listing } from '../../types';

interface Props {
  listing: Listing;
  field: 'pros' | 'cons';
}

const CONFIG = {
  pros: {
    icon: <LuThumbsUp />,
    color: 'green.fg',
    placeholder: 'Плюси...',
    emptyLabel: '+ додати плюси',
    saveLabel: 'Зберегти плюси',
  },
  cons: {
    icon: <LuThumbsDown />,
    color: 'red.fg',
    placeholder: 'Мінуси...',
    emptyLabel: '− додати мінуси',
    saveLabel: 'Зберегти мінуси',
  },
} as const;

/**
 * Комірка «Плюси» або «Мінуси»: обрізаний текст, клік відкриває Popover з Textarea.
 * Один компонент для обох полів — логіка ідентична, різниться лише іконка та колір.
 */
export function ProsConsCell({ listing, field }: Props) {
  // `mounted` — лінивий монтаж: zag-машина Popover з'являється лише після першого
  // кліку. До того в комірці лише легкий статичний тригер (без слухачів/таймерів).
  const [mounted, setMounted] = useState(false);
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState(listing[field]);
  const updateListing = useUpdateListing();
  const cfg = CONFIG[field];

  const handleSave = () => {
    updateListing.mutate({
      id: listing.id,
      searchId: listing.search_id,
      patch: { [field]: value },
    });
    setOpen(false);
  };

  // Індикація AI-аналізу: значок ШІ + tooltip «згенеровано автоматично» з моделлю/датою
  // (план B6). `import` — вставлено з ШІ-чату вручну, решта — авто через OpenRouter.
  const analyzedAt = listing.analysis_at != null
    ? formatDate(listing.analysis_at)?.short ?? listing.analysis_at
    : null;
  const analysisInfo =
    listing.analysis_at != null
      ? listing.analysis_source === ANALYSIS_SOURCE.IMPORT
        ? `Згенеровано ШІ (ручний імпорт), ${analyzedAt}`
        : `Згенеровано автоматично (ШІ${listing.analysis_model ? `: ${listing.analysis_model}` : ''}), ${analyzedAt}`
      : null;

  const label = listing[field] ? (
    <HStack gap={1} align="flex-start">
      <Box color={cfg.color} flexShrink={0} mt="2px">
        {cfg.icon}
      </Box>
      <Text lineClamp={2} whiteSpace="pre-line">
        {listing[field]}
      </Text>
      {listing.analysis_stale === 1 && (
        <Tooltip content="Застарілий аналіз: title/опис змінились після аналізу">
          <Box color="orange.fg" flexShrink={0} mt="2px">
            <LuTriangleAlert />
          </Box>
        </Tooltip>
      )}
      {analysisInfo && listing.analysis_stale !== 1 && (
        <Tooltip content={analysisInfo}>
          <Box color="purple.fg" flexShrink={0} mt="2px" aria-label="Згенеровано штучним інтелектом">
            <LuSparkles size={13} />
          </Box>
        </Tooltip>
      )}
    </HStack>
  ) : (
    <Text color="fg.subtle">{cfg.emptyLabel}</Text>
  );

  if (!mounted) {
    return (
      <Box
        as="button"
        textAlign="left"
        w="full"
        cursor="pointer"
        onClick={() => {
          setValue(listing[field]);
          setOpen(true);
          setMounted(true);
        }}
      >
        {label}
      </Box>
    );
  }

  return (
    <Popover.Root
      open={open}
      onOpenChange={(d) => {
        setOpen(d.open);
        if (d.open) setValue(listing[field]);
      }}
      positioning={{ placement: 'bottom-start' }}
    >
      <Popover.Trigger asChild>
        <Box as="button" textAlign="left" w="full" cursor="pointer">
          {label}
        </Box>
      </Popover.Trigger>
      <Portal>
        <Popover.Positioner>
          <Popover.Content minW="280px">
            <Popover.Arrow />
            <Popover.Body>
              <HStack gap={1} mb={2} color={cfg.color}>
                {cfg.icon}
                <Text textStyle="sm" fontWeight="medium">
                  {field === 'pros' ? 'Плюси' : 'Мінуси'}
                </Text>
              </HStack>
              <Textarea
                value={value}
                onChange={(e) => setValue(e.target.value)}
                placeholder={cfg.placeholder}
                rows={4}
                autoFocus
              />
              <Button
                mt={2}
                size="sm"
                colorPalette={field === 'pros' ? 'green' : 'red'}
                onClick={handleSave}
                loading={updateListing.isPending}
              >
                {cfg.saveLabel}
              </Button>
            </Popover.Body>
          </Popover.Content>
        </Popover.Positioner>
      </Portal>
    </Popover.Root>
  );
}
