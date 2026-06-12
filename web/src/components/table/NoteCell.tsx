import { useState } from 'react';
import { Box, Button, Popover, Portal, Text, Textarea } from '@chakra-ui/react';
import { useUpdateListing } from '../../api/client';
import type { Listing } from '../../types';

interface Props {
  listing: Listing;
}

/**
 * Нотатка: обрізаний текст у комірці, клік відкриває Popover з Textarea.
 * Popover рендериться через Portal — не обмежується overflow таблиці.
 */
export function NoteCell({ listing }: Props) {
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
          {listing.note ? (
            <Text lineClamp={2} whiteSpace="pre-line">
              {listing.note}
            </Text>
          ) : (
            <Text color="fg.subtle">— додати нотатку —</Text>
          )}
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
              <Button mt={2} size="sm" colorPalette="blue" onClick={handleSave} loading={updateListing.isPending}>
                Зберегти
              </Button>
            </Popover.Body>
          </Popover.Content>
        </Popover.Positioner>
      </Portal>
    </Popover.Root>
  );
}
