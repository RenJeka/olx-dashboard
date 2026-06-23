import { Badge, Box, HStack, Link, Stack, Text } from '@chakra-ui/react';
import type { Listing, PickItem } from '../../types';

interface Props {
  pick: PickItem;
  listing: Listing | undefined;
}

const RANK_COLORS = ['yellow', 'gray', 'warning'] as const;

function rankColor(rank: number): string {
  return RANK_COLORS[rank - 1] ?? 'accent';
}

/** Картка одного AI-обраного оголошення (стиль узгоджено з Box-картками проєкту). */
export function AiRankCard({ pick, listing }: Props) {
  const title = listing?.title ?? `#${pick.id}`;
  const price = listing?.price != null ? `${listing.price.toLocaleString('uk-UA')} грн` : '—';
  const city = listing?.city ?? '';
  const pros = listing?.pros ?? '';
  const url = listing?.url ?? null;

  return (
    <Box
      borderWidth="1px"
      borderColor="border.subtle"
      rounded="md"
      p={3}
      minW="240px"
      maxW="300px"
      flexShrink={0}
    >
      <Stack gap={2}>
        <HStack gap={2} align="start">
          <Badge colorPalette={rankColor(pick.rank)} variant="solid" flexShrink={0}>
            #{pick.rank}
          </Badge>
          {url ? (
            <Link href={url} target="_blank" rel="noopener noreferrer" textStyle="sm" fontWeight="semibold" lineClamp={2}>
              {title}
            </Link>
          ) : (
            <Text textStyle="sm" fontWeight="semibold" lineClamp={2}>
              {title}
            </Text>
          )}
        </HStack>

        <HStack gap={3} color="fg.muted" textStyle="xs">
          <Text fontWeight="bold" color="fg">{price}</Text>
          {city && <Text>{city}</Text>}
        </HStack>

        {pros && (
          <Text textStyle="xs" color="success.600" lineClamp={2}>
            {pros}
          </Text>
        )}

        {pick.reason && (
          <Text textStyle="xs" color="fg.muted" lineClamp={3} fontStyle="italic">
            {pick.reason}
          </Text>
        )}
      </Stack>
    </Box>
  );
}
