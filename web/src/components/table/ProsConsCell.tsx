import { useState } from 'react';
import { Box, HStack, Input, Popover, Portal, Tag, Text, Wrap } from '@chakra-ui/react';
import { LuSparkles, LuThumbsDown, LuThumbsUp, LuTriangleAlert } from 'react-icons/lu';
import { useUpdateListing } from '../../api';
import { Tooltip } from '../ui/tooltip';
import { formatDate } from '../../utils/format';
import { joinBullets, parseBullets } from '../../utils/localFilters';
import { ANALYSIS_SOURCE } from '../../constants';
import type { Listing } from '../../types';

interface Props {
  listing: Listing;
  field: 'pros' | 'cons';
}

/** Скільки чипів показувати в комірці; решта — чипом «+N» (рядок таблиці не розростається). */
const MAX_CELL_CHIPS = 3;

const CONFIG = {
  pros: {
    icon: <LuThumbsUp />,
    color: 'success.fg',
    palette: 'success',
    title: 'Плюси',
    placeholder: 'Новий плюс… (Enter — додати)',
    emptyLabel: '+ додати плюси',
  },
  cons: {
    icon: <LuThumbsDown />,
    color: 'danger.fg',
    palette: 'danger',
    title: 'Мінуси',
    placeholder: 'Новий мінус… (Enter — додати)',
    emptyLabel: '− додати мінуси',
  },
} as const;

/**
 * Комірка «Плюси» або «Мінуси»: пункти чипами (перші MAX_CELL_CHIPS + «+N»), клік відкриває Popover
 * з усіма чипами («×» — видалити) і полем вводу (Enter — додати). Кожна зміна зберігається одразу.
 * Формат поля в БД не змінюється — `• a\n• b`. Один компонент для обох полів — різниться лише колір та іконка.
 */
export function ProsConsCell({ listing, field }: Props) {
  // `mounted` — лінивий монтаж: zag-машина Popover з'являється лише після першого
  // кліку. До того в комірці лише легкий статичний тригер (без слухачів/таймерів).
  const [mounted, setMounted] = useState(false);
  const [open, setOpen] = useState(false);
  // Локальна копія пунктів у редакторі: швидкі послідовні зміни не губляться до оновлення кешу.
  const [items, setItems] = useState(() => parseBullets(listing[field]));
  const [draft, setDraft] = useState('');
  const updateListing = useUpdateListing();
  const cfg = CONFIG[field];

  const openEditor = () => {
    setItems(parseBullets(listing[field]));
    setDraft('');
  };

  const saveItems = (next: string[]) => {
    setItems(next);
    updateListing.mutate({
      id: listing.id,
      searchId: listing.search_id,
      patch: { [field]: joinBullets(next) },
    });
  };

  const handleAdd = () => {
    const item = draft.trim();
    if (!item) return;
    setDraft('');
    // Дубль без урахування регістру не додаємо.
    if (items.some((existing) => existing.toLowerCase() === item.toLowerCase())) return;
    saveItems([...items, item]);
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

  const cellItems = parseBullets(listing[field]);
  const hiddenCount = cellItems.length - MAX_CELL_CHIPS;

  const label = cellItems.length > 0 ? (
    <HStack gap={1} align="flex-start">
      <Wrap gap={1} flex="1" minW={0}>
        {cellItems.slice(0, MAX_CELL_CHIPS).map((item, i) => (
          <Tag.Root key={`${i}-${item}`} size="sm" colorPalette={cfg.palette} maxW="full">
            <Tag.Label truncate>{item}</Tag.Label>
          </Tag.Root>
        ))}
        {hiddenCount > 0 && (
          <Tag.Root size="sm" variant="outline">
            <Tag.Label>+{hiddenCount}</Tag.Label>
          </Tag.Root>
        )}
      </Wrap>
      {listing.analysis_stale === 1 && (
        <Tooltip content="Застарілий аналіз: title/опис змінились після аналізу">
          <Box color="warning.fg" flexShrink={0} mt="2px">
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
          openEditor();
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
        if (d.open) openEditor();
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
          <Popover.Content minW="280px" maxW="420px">
            <Popover.Arrow />
            <Popover.Body>
              <HStack gap={1} mb={2} color={cfg.color}>
                {cfg.icon}
                <Text textStyle="sm" fontWeight="medium">
                  {cfg.title}
                </Text>
              </HStack>
              {items.length > 0 && (
                <Wrap gap={1} mb={2}>
                  {items.map((item, i) => (
                    <Tag.Root key={`${i}-${item}`} size="md" colorPalette={cfg.palette} maxW="full">
                      <Tag.Label>{item}</Tag.Label>
                      <Tag.EndElement>
                        <Tag.CloseTrigger
                          cursor="pointer"
                          aria-label={`Видалити «${item}»`}
                          onClick={() => saveItems(items.filter((existing) => existing !== item))}
                        />
                      </Tag.EndElement>
                    </Tag.Root>
                  ))}
                </Wrap>
              )}
              <Input
                size="sm"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
                    e.preventDefault();
                    handleAdd();
                  }
                }}
                placeholder={cfg.placeholder}
                autoFocus
              />
            </Popover.Body>
          </Popover.Content>
        </Popover.Positioner>
      </Portal>
    </Popover.Root>
  );
}
