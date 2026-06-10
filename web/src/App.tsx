import { useEffect, useState } from 'react';
import { Box, Flex, Heading, HStack } from '@chakra-ui/react';
import type { VisibilityState } from '@tanstack/react-table';
import { LuSearch } from 'react-icons/lu';
import { SettingsDrawer } from './components/SettingsDrawer';
import { Toaster } from './components/ui/toaster';
import { Searches } from './pages/Searches';
import { ListingsTable } from './pages/ListingsTable';

const SETTINGS_STORAGE_KEY = 'olx-ui-settings-v1';

function loadColumnVisibility(): VisibilityState {
  try {
    const raw = localStorage.getItem(SETTINGS_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as { columnVisibility?: VisibilityState };
    return parsed.columnVisibility ?? {};
  } catch {
    return {};
  }
}

export function App() {
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>(() =>
    loadColumnVisibility(),
  );

  useEffect(() => {
    localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify({ columnVisibility }));
  }, [columnVisibility]);

  return (
    <Flex direction="column" h="100vh">
      <Box as="header" borderBottomWidth="1px" borderColor="border.subtle" px={4} py={3}>
        <HStack justify="space-between">
          <HStack gap={2}>
            <LuSearch />
            <Heading size="lg">OLX Monitor</Heading>
          </HStack>
          <SettingsDrawer
            columnVisibility={columnVisibility}
            onColumnVisibilityChange={setColumnVisibility}
          />
        </HStack>
      </Box>
      <Flex flex="1" overflow="hidden">
        <Searches selectedId={selectedId} onSelect={setSelectedId} />
        <ListingsTable
          searchId={selectedId}
          columnVisibility={columnVisibility}
          onColumnVisibilityChange={setColumnVisibility}
        />
      </Flex>
      <Toaster />
    </Flex>
  );
}
