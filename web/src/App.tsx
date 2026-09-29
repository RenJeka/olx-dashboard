import { Flex } from '@chakra-ui/react';
import { Header } from './components/Header';
import { Toaster } from './components/ui/toaster';
import { useAutoRefresh } from './hooks/useAutoRefresh';
import { Searches } from './components/searches';
import { ListingsTable } from './pages/ListingsTable';
import { AuthGate } from './auth/AuthGate';

// Тіло застосунку — рендериться лише після проходження гейта, тож захищені ендпойнти
// (зокрема автооновлення) не бʼються до логіну.
function Dashboard() {
  useAutoRefresh();

  return (
    <Flex direction="column" h="100vh">
      <Header />
      <Flex flex="1" overflow="hidden">
        <Searches />
        <ListingsTable />
      </Flex>
      <Toaster />
    </Flex>
  );
}

export function App() {
  return (
    <AuthGate>
      <Dashboard />
    </AuthGate>
  );
}
