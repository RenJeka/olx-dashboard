import { Box, Image, SimpleGrid, Stack, Text } from '@chakra-ui/react';
import { Tooltip } from '../ui/tooltip';
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
 * Комірка «Фото»: мініатюра, що при наведенні показує збільшене головне фото +
 * сітку решти прев'ю (galery з GraphQL photos[]). Tooltip-контент некликабельний —
 * лише перегляд (надійніше за hover-popover). Для старої БД (photo_urls = NULL)
 * fallback — збільшений `photo_url`.
 */
export function PhotoCell({ listing }: { listing: Listing }) {
  const thumb = listing.photo_url;
  if (!thumb) {
    return <Box boxSize={12} rounded="md" bg="bg.muted" />;
  }

  const gallery = parsePhotoUrls(listing.photo_urls);
  // Великий показ — перше з photo_urls (600x450) або fallback на мініатюру.
  const main = gallery[0] ?? thumb;
  const rest = gallery.slice(1);

  const preview = (
    <Stack gap={2} maxW="380px">
      <Image
        src={main}
        alt={listing.title ?? ''}
        rounded="md"
        objectFit="contain"
        maxH="280px"
        w="full"
        bg="bg.muted"
      />
      {rest.length > 0 && (
        <>
          <Text textStyle="xs" color="fg.muted">
            Ще фото: {rest.length}
          </Text>
          <SimpleGrid columns={4} gap={1}>
            {rest.map((src, i) => (
              <Image
                key={i}
                src={src}
                alt=""
                rounded="sm"
                objectFit="cover"
                aspectRatio={4 / 3}
                w="full"
                bg="bg.muted"
              />
            ))}
          </SimpleGrid>
        </>
      )}
    </Stack>
  );

  return (
    <Tooltip
      content={preview}
      contentProps={{ bg: 'bg.panel', color: 'fg', p: 2, maxW: 'unset' }}
      positioning={{ placement: 'right' }}
      openDelay={200}
      closeDelay={100}
    >
      <Image
        src={thumb}
        alt=""
        boxSize={12}
        rounded="md"
        objectFit="cover"
        loading="lazy"
        cursor="zoom-in"
      />
    </Tooltip>
  );
}
