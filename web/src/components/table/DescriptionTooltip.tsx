import { Box, Spinner } from '@chakra-ui/react';
import { useState, type ReactNode } from 'react';
import { Tooltip } from '../ui/tooltip';
import { stripDescriptionHtml } from '../../utils/format';
import { useListingDetails } from '../../api';
import { HighlightText } from './HighlightText';

type DescriptionSource =
  /** Опис уже є (AI-майстер отримує описи пакетом). */
  | { description: string | null; listingId?: never; hasDescription?: never }
  /** Таблиця: повного опису в списку немає — завантажується при першому наведенні. */
  | { listingId: number; hasDescription: boolean; description?: never };

type DescriptionTooltipProps = DescriptionSource & {
  /** Рядок-запит (фільтр таблиці) або масив фрагментів (evidence у превʼю аналізу). */
  query: string | string[];
  children: ReactNode;
  onClick: () => void;
};

export function DescriptionTooltip(props: DescriptionTooltipProps) {
  const { query, children, onClick } = props;
  // `mounted` — лінивий монтаж: zag-машина Tooltip (і запит опису) з'являється лише після першого
  // наведення. До того — статичний обрізаний текст з cursor=pointer (клік відкриває діалог опису).
  const [mounted, setMounted] = useState(false);
  const hasText =
    props.listingId != null ? props.hasDescription : stripDescriptionHtml(props.description) !== '';
  if (!hasText) return <>{children}</>;

  const trigger = (
    <Box
      cursor="pointer"
      rounded="sm"
      _hover={{ bg: 'bg.muted' }}
      onClick={onClick}
      onMouseEnter={mounted ? undefined : () => setMounted(true)}
    >
      {children}
    </Box>
  );
  if (!mounted) return trigger;

  return (
    <Tooltip
      interactive
      openDelay={400}
      closeDelay={500}
      closeOnScroll={false}
      content={
        <Box maxH="240px" overflowY="auto" whiteSpace="pre-line" fontSize="sm">
          {props.listingId != null ? (
            <LazyDescription listingId={props.listingId} query={query} />
          ) : (
            <HighlightText text={stripDescriptionHtml(props.description)} query={query} />
          )}
        </Box>
      }
      contentProps={{ maxW: { base: '85vw', md: '380px' } }}
    >
      {trigger}
    </Tooltip>
  );
}

function LazyDescription({ listingId, query }: { listingId: number; query: string | string[] }) {
  const { data, isLoading } = useListingDetails(listingId);
  if (isLoading) return <Spinner size="xs" />;
  return <HighlightText text={stripDescriptionHtml(data?.description ?? null)} query={query} />;
}
