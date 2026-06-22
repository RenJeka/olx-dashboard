import { useState } from 'react';
import { Box, Image, Popover, Portal, SimpleGrid, Stack, Text } from '@chakra-ui/react';
import { CloseButton } from '../ui/close-button';
import type { Listing } from '../../types';

/** Парсить JSON-масив прев'ю-лінків (photo_urls); повертає [] при NULL/помилці. */
function parsePhotoUrls(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === 'string') : [];
  } catch {
    return [];
  }
}

/**
 * Комірка «Фото»: мініатюра з інтерактивною модалкою-галереєю.
 * - Наведення на мініатюру → відкриває прев'ю праворуч (велике головне + сітка решти).
 * - Клік по мініатюрі → «фіксує» модалку (pinned): вона лишається після відведення миші,
 *   у сітці прев'ю стають інтерактивними — наведення робить фото головним великим,
 *   у куті — кнопка ✕; клік поза модалкою / Esc закриває.
 * Дані — `photo_urls` (galery з GraphQL photos[]); для старої БД (NULL) fallback на `photo_url`.
 */
export function PhotoCell({ listing }: { listing: Listing }) {
  const thumb = listing.photo_url;
  const [open, setOpen] = useState(false);
  const [pinned, setPinned] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);

  if (!thumb) {
    return <Box boxSize={12} rounded="md" bg="bg.muted" />;
  }

  const gallery = parsePhotoUrls(listing.photo_urls);
  // Усі фото для перегляду: galery (600x450) або fallback на мініатюру.
  const allPhotos = gallery.length > 0 ? gallery : [thumb];
  // У pinned-режимі активне фото керується наведенням; у hover-режимі завжди перше.
  const mainIndex = pinned ? activeIndex : 0;
  const main = allPhotos[mainIndex] ?? thumb;
  const rest = allPhotos.slice(1);

  const reset = () => {
    setOpen(false);
    setPinned(false);
    setActiveIndex(0);
  };

  return (
    <Popover.Root
      open={open}
      onOpenChange={(e) => {
        // Закриття ззовні (клік поза / Esc) — повне скидання стану.
        if (!e.open) reset();
        else setOpen(true);
      }}
      positioning={{ placement: 'right' }}
      autoFocus={false}
      closeOnInteractOutside
      lazyMount
      unmountOnExit
    >
      <Popover.Anchor asChild>
        <Image
          src={thumb}
          alt=""
          boxSize={12}
          rounded="md"
          objectFit="cover"
          loading="lazy"
          cursor="zoom-in"
          onMouseEnter={() => setOpen(true)}
          onMouseLeave={() => {
            if (!pinned) setOpen(false);
          }}
          onClick={() => {
            setPinned(true);
            setOpen(true);
          }}
        />
      </Popover.Anchor>
      <Portal>
        <Popover.Positioner>
          <Popover.Content
            bg="bg.panel"
            color="fg"
            borderWidth="1px"
            borderColor="border.subtle"
            shadow="lg"
            p={2}
            maxW={pinned ? '440px' : '380px'}
            w="auto"
            onMouseLeave={() => {
              if (!pinned) setOpen(false);
            }}
          >
            <Stack gap={2} position="relative">
              {pinned && (
                <CloseButton
                  size="sm"
                  position="absolute"
                  top={0}
                  right={0}
                  zIndex={1}
                  bg="bg.panel"
                  onClick={reset}
                />
              )}
              <Image
                src={main}
                alt={listing.title ?? ''}
                rounded="md"
                objectFit="contain"
                maxH="300px"
                w="full"
                bg="bg.muted"
              />
              {rest.length > 0 && (
                <>
                  <Text textStyle="xs" color="fg.muted">
                    {pinned ? 'Наведіть, щоб переглянути:' : `Ще фото: ${rest.length}`}
                  </Text>
                  <SimpleGrid columns={4} gap={1}>
                    {allPhotos.map((src, i) => (
                      <Image
                        key={i}
                        src={src}
                        alt=""
                        rounded="sm"
                        objectFit="cover"
                        aspectRatio={4 / 3}
                        w="full"
                        bg="bg.muted"
                        cursor={pinned ? 'pointer' : undefined}
                        borderWidth="2px"
                        borderColor={pinned && i === mainIndex ? 'border.emphasized' : 'transparent'}
                        onMouseEnter={pinned ? () => setActiveIndex(i) : undefined}
                      />
                    ))}
                  </SimpleGrid>
                </>
              )}
            </Stack>
          </Popover.Content>
        </Popover.Positioner>
      </Portal>
    </Popover.Root>
  );
}
