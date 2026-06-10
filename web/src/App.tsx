import { useState } from 'react';
import { Box, Flex, Heading } from '@chakra-ui/react';
import { Toaster } from './components/ui/toaster';
import { Searches } from './pages/Searches';
import { ListingsTable } from './pages/ListingsTable';

export function App() {
  const [selectedId, setSelectedId] = useState<number | null>(null);

  return (
    <Flex direction="column" h="100vh">
      <Box as="header" borderBottomWidth="1px" borderColor="border.subtle" px={4} py={3}>
        <Heading size="lg">OLX Monitor</Heading>
      </Box>
      <Flex flex="1" overflow="hidden">
        <Searches selectedId={selectedId} onSelect={setSelectedId} />
        <ListingsTable searchId={selectedId} />
      </Flex>
      <Toaster />
    </Flex>
  );
}
