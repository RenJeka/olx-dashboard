import { Badge, Box, Heading, HStack, IconButton } from '@chakra-ui/react';
import type { OnChangeFn, VisibilityState } from '@tanstack/react-table';
import { LuChevronLeft, LuMenu, LuTimer } from 'react-icons/lu';
import { TbHeartRateMonitor } from 'react-icons/tb';
import { SearchActionPanel } from './SearchActionPanel';
import { SettingsDrawer } from './settings/SettingsDrawer';
import { Tooltip } from './ui/tooltip';
import type { Search } from '../types';

interface HeaderProps {
  searchesVisible: boolean;
  onSearchesVisibleChange: (visible: boolean) => void;
  selectedSearch: Search | undefined;
  autoRefreshEnabled: boolean;
  onAutoRefreshEnabledChange: (enabled: boolean) => void;
  autoRefreshIntervalMin: number;
  onAutoRefreshIntervalMinChange: (interval: number) => void;
  columnVisibility: VisibilityState;
  onColumnVisibilityChange: OnChangeFn<VisibilityState>;
  descriptionExpandEnabled: boolean;
  onDescriptionExpandEnabledChange: (enabled: boolean) => void;
}

export function Header({
  searchesVisible,
  onSearchesVisibleChange,
  selectedSearch,
  autoRefreshEnabled,
  onAutoRefreshEnabledChange,
  autoRefreshIntervalMin,
  onAutoRefreshIntervalMinChange,
  columnVisibility,
  onColumnVisibilityChange,
  descriptionExpandEnabled,
  onDescriptionExpandEnabledChange,
}: HeaderProps) {
  return (
    <Box as="header" borderBottomWidth="1px" borderColor="border.subtle" px={4} py={3} bg="bg.panel">
      <HStack justify="space-between">
        <HStack gap={3}>
          <Tooltip content={searchesVisible ? 'Сховати бічну панель' : 'Показати бічну панель'}>
            <IconButton
              aria-label="Toggle Sidebar"
              variant="ghost"
              size="sm"
              onClick={() => onSearchesVisibleChange(!searchesVisible)}
            >
              {searchesVisible ? <LuChevronLeft /> : <LuMenu />}
            </IconButton>
          </Tooltip>
          <HStack gap={2}>
            <TbHeartRateMonitor size={20} />
            <Heading size="lg" fontWeight="bold">OLX Dashboard</Heading>
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
              ml={"80px"}
              borderRadius="md"
              fontSize="sm"
              fontWeight="semibold"
              shadow="sm"
            >
              {selectedSearch.name}
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
          <SettingsDrawer
            columnVisibility={columnVisibility}
            onColumnVisibilityChange={onColumnVisibilityChange}
            descriptionExpandEnabled={descriptionExpandEnabled}
            onDescriptionExpandEnabledChange={onDescriptionExpandEnabledChange}
            autoRefreshEnabled={autoRefreshEnabled}
            onAutoRefreshEnabledChange={onAutoRefreshEnabledChange}
            autoRefreshIntervalMin={autoRefreshIntervalMin}
            onAutoRefreshIntervalMinChange={onAutoRefreshIntervalMinChange}
          />
        </HStack>
      </HStack>
    </Box>
  );
}
