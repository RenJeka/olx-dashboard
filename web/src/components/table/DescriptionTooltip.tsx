import { Box } from '@chakra-ui/react';
import { useState, type ReactNode } from 'react';
import { Tooltip } from '../ui/tooltip';
import { stripDescriptionHtml } from '../../utils/format';
import { HighlightText } from './HighlightText';

interface DescriptionTooltipProps {
  description: string | null;
  /** Рядок-запит (фільтр таблиці) або масив фрагментів (evidence у превʼю аналізу). */
  query: string | string[];
  children: ReactNode;
  onClick: () => void;
}

export function DescriptionTooltip({ description, query, children, onClick }: DescriptionTooltipProps) {
  // `mounted` — лінивий монтаж: zag-машина Tooltip з'являється лише після першого
  // наведення. До того — статичний обрізаний текст з cursor=pointer (клік відкриває
  // діалог опису). Прибирає до 50 завжди-змонтованих тултіпів на сторінку.
  const [mounted, setMounted] = useState(false);
  const fullText = stripDescriptionHtml(description);
  if (!fullText) return <>{children}</>;

  if (!mounted) {
    return (
      <Box
        cursor="pointer"
        rounded="sm"
        _hover={{ bg: 'bg.muted' }}
        onClick={onClick}
        onMouseEnter={() => setMounted(true)}
      >
        {children}
      </Box>
    );
  }

  return (
    <Tooltip
      interactive
      openDelay={400}
      closeDelay={500}
      closeOnScroll={false}
      content={
        <Box maxH="240px" overflowY="auto" whiteSpace="pre-line" fontSize="sm">
          <HighlightText text={fullText} query={query} />
        </Box>
      }
      contentProps={{ maxW: '380px' }}
    >
      <Box
        cursor="pointer"
        rounded="sm"
        _hover={{ bg: 'bg.muted' }}
        onClick={onClick}
      >
        {children}
      </Box>
    </Tooltip>
  );
}
