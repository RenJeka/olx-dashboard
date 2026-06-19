import { Heading, HStack, Stack, Text } from '@chakra-ui/react';
import { LuFileText, LuMoon, LuSun } from 'react-icons/lu';
import { Switch } from '../../ui/switch';
import { useColorMode } from '../../ui/color-mode';
import { useSettingsStore } from '../../../stores/settingsStore';

export function VisualSection() {
  const descriptionExpandEnabled = useSettingsStore((s) => s.descriptionExpandEnabled);
  const setDescriptionExpandEnabled = useSettingsStore((s) => s.setDescriptionExpandEnabled);
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
        onCheckedChange={(details) => setDescriptionExpandEnabled(details.checked)}
      >
        <HStack gap={1}>
          <LuFileText />
          <Text>Розширений перегляд опису (тултіп + модалка)</Text>
        </HStack>
      </Switch>
    </Stack>
  );
}
