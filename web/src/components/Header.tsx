import { useMemo } from 'react';
import { Badge, Box, Heading, HStack, IconButton } from '@chakra-ui/react';
import { LuChevronLeft, LuMenu, LuTimer } from 'react-icons/lu';
import { TbHeartRateMonitor } from 'react-icons/tb';
import { SearchActionPanel } from './searches/SearchActionPanel';
import { AnalysisWizardDialog, AiPicksDialog, RelevanceFilterDialog } from './analysis';
import { SettingsDrawer } from './settings';
import { Tooltip } from './ui/tooltip';
import { useSearches } from '../api';
import { useSettingsStore } from '../stores/settingsStore';

export function Header() {
  const { data: searches } = useSearches();
  
  const searchesVisible = useSettingsStore((s) => s.searchesVisible);
  const setSearchesVisible = useSettingsStore((s) => s.setSearchesVisible);
  
  const selectedSearchId = useSettingsStore((s) => s.selectedSearchId);
  const selectedSearch = searches?.find((s) => s.id === selectedSearchId);
  
  const rowSelection = useSettingsStore((s) => s.rowSelection);
  const selectedIds = useMemo(
    () =>
      Object.entries(rowSelection)
        .filter(([, v]) => v)
        .map(([k]) => Number(k)),
    [rowSelection],
  );

  const autoRefreshEnabled = useSettingsStore((s) => s.autoRefreshEnabled);
  const autoRefreshIntervalMin = useSettingsStore((s) => s.autoRefreshIntervalMin);

  return (
    <Box as="header" borderBottomWidth="1px" borderColor="border.subtle" px={4} py={3} bg="bg.panel">
      <HStack justify="space-between" wrap="wrap" rowGap={2}>
        <HStack gap={3}>
          <Tooltip content={searchesVisible ? 'Сховати бічну панель' : 'Показати бічну панель'}>
            <IconButton
              aria-label="Toggle Sidebar"
              variant="ghost"
              size="sm"
              onClick={() => setSearchesVisible(!searchesVisible)}
            >
              {searchesVisible ? <LuChevronLeft /> : <LuMenu />}
            </IconButton>
          </Tooltip>
          <HStack gap={2}>
            <TbHeartRateMonitor size={20} />
            <Heading size="lg" fontWeight="bold" display={{ base: 'none', md: 'block' }}>
              OLX Dashboard
            </Heading>
          </HStack>
          {selectedSearch && (
            <HStack
              gap={1.5}
              bg="green.subtle"
              color="green.fg"
              borderWidth="1px"
              borderColor="green.muted"
              px={3}
              py={1.5}
              ml={{ base: 0, md: '80px' }}
              borderRadius="md"
              fontSize="sm"
              fontWeight="semibold"
              shadow="sm"
              maxW={{ base: '40vw', md: 'none' }}
            >
              <Box as="span" lineClamp={1}>
                {selectedSearch.name}
              </Box>
            </HStack>
          )}
        </HStack>
        <HStack gap={2}>
          {autoRefreshEnabled && (
            <Badge colorPalette="blue" variant="subtle" size="lg" px={2.5} py={1}>
              <LuTimer /> авто: {autoRefreshIntervalMin} хв
            </Badge>
          )}
          {selectedSearch && <SearchActionPanel search={selectedSearch} />}
          {selectedSearch && <RelevanceFilterDialog search={selectedSearch} selectedIds={selectedIds} />}
          {selectedSearch && <AnalysisWizardDialog search={selectedSearch} selectedIds={selectedIds} />}
          {selectedSearch && <AiPicksDialog search={selectedSearch} />}
          <SettingsDrawer />
        </HStack>
      </HStack>
    </Box>
  );
}
