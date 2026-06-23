import { Box, Button, HStack, Icon, Stack, Text } from '@chakra-ui/react';
import type { IconType } from 'react-icons';

interface Props {
  number: number;
  title: string;
  description: string;
  icon: IconType;
  colorPalette: string;
  onRun: () => void;
}

/** Клікабельна картка кроку в хабі AI-інструментів (`AiHubDialog`). */
export function AiHubStepCard({ number, title, description, icon, colorPalette, onRun }: Props) {
  return (
    <Box
      as="button"
      onClick={onRun}
      w="full"
      textAlign="left"
      borderWidth="1px"
      borderColor="border.subtle"
      rounded="lg"
      bg="bg.panel"
      p={4}
      cursor="pointer"
      transition="border-color 0.15s ease, box-shadow 0.15s ease, background 0.15s ease"
      _hover={{ borderColor: 'colorPalette.muted', shadow: 'md', bg: 'bg.muted' }}
      colorPalette={colorPalette}
    >
      <HStack gap={4} align="center">
        <Box
          boxSize={7}
          rounded="full"
          bg="colorPalette.solid"
          color="colorPalette.contrast"
          display="flex"
          alignItems="center"
          justifyContent="center"
          fontWeight="bold"
          fontSize="sm"
          flexShrink={0}
        >
          {number}
        </Box>
        <Box
          boxSize={10}
          rounded="md"
          bg="colorPalette.subtle"
          color="colorPalette.fg"
          display="flex"
          alignItems="center"
          justifyContent="center"
          flexShrink={0}
        >
          <Icon as={icon} boxSize={5} />
        </Box>
        <Stack gap={0.5} flex="1" minW={0}>
          <Text fontWeight="semibold">
            Крок {number}: {title}
          </Text>
          <Text textStyle="sm" color="fg.muted">
            {description}
          </Text>
        </Stack>
        <Button
          size="sm"
          colorPalette={colorPalette}
          variant="solid"
          flexShrink={0}
          onClick={(e) => {
            e.stopPropagation();
            onRun();
          }}
        >
          Запустити
        </Button>
      </HStack>
    </Box>
  );
}
