import { Box } from '@chakra-ui/react';
import { LuInfo } from 'react-icons/lu';
import { Tooltip } from '../../../ui/tooltip';

/** Іконка «i» з тултіпом — для виносу довшого пояснення з основного тексту звіту. */
export function InfoTooltip({ content }: { content: React.ReactNode }) {
  return (
    <Tooltip content={content} contentProps={{ maxW: '280px' }}>
      <Box as={LuInfo} display="inline-block" color="fg.muted" fontSize="xs" verticalAlign="middle" cursor="help" />
    </Tooltip>
  );
}
