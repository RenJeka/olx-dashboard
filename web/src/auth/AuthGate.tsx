import type { ReactNode } from 'react';
import { Box, Center, Heading, Spinner, Text, VStack } from '@chakra-ui/react';
import { TbHeartRateMonitor } from 'react-icons/tb';
import { GoogleLogin } from '@react-oauth/google';
import { useLogin, useSession } from './useAuth';

/**
 * Замок доступу: поки не пройдено авторизацію — рендериться екран входу з Google, а не
 * застосунок. Це гарантує, що захищені ендпойнти не бʼються до логіну.
 */
export function AuthGate({ children }: { children: ReactNode }) {
  const session = useSession();
  const login = useLogin();

  // Перше завантаження сесії — спінер (щоб не блимати гейтом для вже залогінених).
  if (session.isLoading) {
    return (
      <Center h="100vh">
        <Spinner size="lg" colorPalette="accent" />
      </Center>
    );
  }

  // Є валідна сесія — пускаємо застосунок.
  if (session.data) return <>{children}</>;

  // Інакше — гейт.
  return (
    <Center h="100vh" bg="bg.subtle" px={4}>
      <VStack
        gap={6}
        bg="bg.panel"
        borderWidth="1px"
        borderColor="border.subtle"
        borderRadius="xl"
        shadow="lg"
        px={{ base: 8, md: 12 }}
        py={{ base: 10, md: 12 }}
        maxW="sm"
        w="full"
      >
        <VStack gap={2}>
          <TbHeartRateMonitor size={36} />
          <Heading size="lg" textAlign="center">
            OLX Dashboard
          </Heading>
          <Text fontSize="sm" color="fg.muted" textAlign="center">
            Увійдіть через Google, щоб отримати доступ.
          </Text>
        </VStack>

        <Box>
          <GoogleLogin
            onSuccess={(resp) => {
              if (resp.credential) login.mutate(resp.credential);
            }}
            onError={() => login.reset()}
          />
        </Box>

        {login.isError && (
          <Text fontSize="sm" color="error.fg" textAlign="center">
            {login.error.message || 'Не вдалося увійти. Спробуйте ще раз.'}
          </Text>
        )}
      </VStack>
    </Center>
  );
}
