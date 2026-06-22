import { useState } from 'react';
import { Box, Button, Popover, Portal, Text, Textarea } from '@chakra-ui/react';
import { useUpdateListing } from '../../api';
import type { Listing } from '../../types';

interface Props {
  listing: Listing;
}

/**
 * Нотатка: обрізаний текст у комірці, клік відкриває Popover з Textarea.
 * Popover рендериться через Portal — не обмежується overflow таблиці.
 */
export function NoteCell({ listing }: Props) {
  // `mounted` — лінивий монтаж: zag-машина Popover з'являється лише після першого
  // кліку. До того в комірці лише легкий статичний тригер (без слухачів/таймерів).
  const [mounted, setMounted] = useState(false);
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState(listing.note);
  const updateListing = useUpdateListing();

  const handleSave = () => {
    updateListing.mutate({
      id: listing.id,
      searchId: listing.search_id,
      patch: { note: value },
    });
    setOpen(false);
  };

  const label = listing.note ? (
    <Text lineClamp={2} whiteSpace="pre-line">
      {listing.note}
    </Text>
  ) : (
    <Text color="fg.subtle">— додати нотатку —</Text>
  );

  if (!mounted) {
    return (
      <Box
        as="button"
        textAlign="left"
        w="full"
        cursor="pointer"
        onClick={() => {
          setValue(listing.note);
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
        if (d.open) setValue(listing.note);
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
              <Textarea
                value={value}
                onChange={(e) => setValue(e.target.value)}
                placeholder="Нотатка..."
                rows={4}
                autoFocus
              />
              <Button mt={2} size="sm" colorPalette="accent" onClick={handleSave} loading={updateListing.isPending}>
                Зберегти
              </Button>
            </Popover.Body>
          </Popover.Content>
        </Popover.Positioner>
      </Portal>
    </Popover.Root>
  );
}
