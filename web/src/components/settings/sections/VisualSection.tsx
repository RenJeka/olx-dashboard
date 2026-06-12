import { Heading, HStack, Stack, Text } from '@chakra-ui/react';
import { LuFileText, LuMoon, LuSun } from 'react-icons/lu';
import { Switch } from '../../ui/switch';
import { useColorMode } from '../../ui/color-mode';

interface VisualSectionProps {
  descriptionExpandEnabled: boolean;
  onDescriptionExpandEnabledChange: (value: boolean) => void;
}

export function VisualSection({
  descriptionExpandEnabled,
  onDescriptionExpandEnabledChange,
}: VisualSectionProps) {
  const { colorMode, toggleColorMode } = useColorMode();

  return (
    <Stack gap={3}>
      <Heading size="sm">Візуальний вигляд</Heading>
      <Switch checked={colorMode === 'dark'} onCheckedChange={() => toggleColorMode()}>
        <HStack gap={1}>
          {colorMode === 'dark' ? <LuMoon /> : <LuSun />}
          <Text>Темна тема</Text>
        </HStack>
      </Switch>
      <Switch
        checked={descriptionExpandEnabled}
        onCheckedChange={(details) => onDescriptionExpandEnabledChange(details.checked)}
      >
        <HStack gap={1}>
          <LuFileText />
          <Text>Розширений перегляд опису (тултіп + модалка)</Text>
        </HStack>
      </Switch>
    </Stack>
  );
}
