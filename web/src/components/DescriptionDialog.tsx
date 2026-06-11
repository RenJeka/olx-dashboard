import { Box, Button, HStack, Image, Link, Stack, Text } from '@chakra-ui/react';
import { LuExternalLink } from 'react-icons/lu';
import {
  DialogBackdrop,
  DialogBody,
  DialogCloseTrigger,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogRoot,
  DialogTitle,
} from './ui/dialog';
import type { Listing } from '../types';
import { formatPrice, stripDescriptionHtml } from '../utils/format';

interface Props {
  listing: Listing | null;
  onClose: () => void;
}

export function DescriptionDialog({ listing, onClose }: Props) {
  const text = stripDescriptionHtml(listing?.description ?? null);

  return (
    <DialogRoot
      open={listing != null}
      onOpenChange={(d) => !d.open && onClose()}
      size="lg"
      placement="center"
      scrollBehavior="inside"
    >
      <DialogBackdrop />
      <DialogContent>
        <DialogCloseTrigger />
        {listing && (
          <>
            <DialogHeader>
              <HStack gap={3} align="start" pr={8}>
                {listing.photo_url ? (
                  <Image
                    src={listing.photo_url}
                    alt=""
                    boxSize={16}
                    rounded="md"
                    objectFit="cover"
                    flexShrink={0}
                  />
                ) : (
                  <Box boxSize={16} rounded="md" bg="bg.muted" flexShrink={0} />
                )}
                <Stack gap={1} minW={0}>
                  <DialogTitle lineClamp={2}>{listing.title ?? '—'}</DialogTitle>
                  <Text fontWeight="semibold" color="colorPalette.fg" colorPalette="blue">
                    {formatPrice(listing)}
                  </Text>
                  {listing.city && (
                    <Text textStyle="sm" color="fg.muted">
                      {listing.city}
                    </Text>
                  )}
                </Stack>
              </HStack>
            </DialogHeader>
            <DialogBody>
              <Text whiteSpace="pre-line">{text || '—'}</Text>
            </DialogBody>
            <DialogFooter>
              {listing.url && (
                <Link href={listing.url} target="_blank" rel="noreferrer">
                  <Button colorPalette="blue" variant="outline">
                    <LuExternalLink /> Відкрити на OLX
                  </Button>
                </Link>
              )}
              <Button onClick={onClose}>Закрити</Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </DialogRoot>
  );
}
