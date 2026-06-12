import { Box } from '@chakra-ui/react';
import type { ReactNode } from 'react';
import { Tooltip } from '../ui/tooltip';
import { stripDescriptionHtml } from '../../utils/format';
import { HighlightText } from './HighlightText';

interface DescriptionTooltipProps {
  description: string | null;
  query: string;
  children: ReactNode;
  onClick: () => void;
}

export function DescriptionTooltip({ description, query, children, onClick }: DescriptionTooltipProps) {
  const fullText = stripDescriptionHtml(description);
  if (!fullText) return <>{children}</>;

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
