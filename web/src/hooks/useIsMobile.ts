import { useBreakpointValue } from '@chakra-ui/react';

/**
 * `true` для viewport вужче за `md` (768px) — єдине джерело "мобільний/desktop"
 * для умовного рендеру (size/layout branching).
 */
export function useIsMobile(): boolean {
  return useBreakpointValue({ base: true, md: false }) ?? false;
}
