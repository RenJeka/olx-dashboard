import { Heading, HStack, NativeSelect, Stack, Text } from '@chakra-ui/react';
import { LuTimer } from 'react-icons/lu';
import { Switch } from '../../ui/switch';
import { useSettingsStore } from '../../../stores/settingsStore';

export function AutoRefreshSection() {
  const autoRefreshEnabled = useSettingsStore((s) => s.autoRefreshEnabled);
  const setAutoRefreshEnabled = useSettingsStore((s) => s.setAutoRefreshEnabled);
  const autoRefreshIntervalMin = useSettingsStore((s) => s.autoRefreshIntervalMin);
  const setAutoRefreshIntervalMin = useSettingsStore((s) => s.setAutoRefreshIntervalMin);
  return (
    <Stack gap={3}>
      <Heading size="sm">Автооновлення</Heading>
      <Switch
        checked={autoRefreshEnabled}
        onCheckedChange={(details) => setAutoRefreshEnabled(details.checked)}
      >
        <HStack gap={1}>
          <LuTimer />
          <Text>Автоматично сканувати всі пошуки</Text>
        </HStack>
      </Switch>
      <NativeSelect.Root size="sm" w="40" disabled={!autoRefreshEnabled}>
        <NativeSelect.Field
          value={String(autoRefreshIntervalMin)}
          onChange={(e) => setAutoRefreshIntervalMin(Number(e.target.value))}
          cursor={autoRefreshEnabled ? 'pointer' : undefined}
        >
          <option value="15">Кожні 15 хв</option>
          <option value="30">Кожні 30 хв</option>
          <option value="60">Кожні 60 хв</option>
        </NativeSelect.Field>
        <NativeSelect.Indicator />
      </NativeSelect.Root>
      <Text textStyle="xs" color="fg.muted">
        Поки вкладка відкрита — швидкий скан усіх пошуків по черзі, з паузами між
        ними. Глибокий скан і перевірку автооновлення не запускає.
      </Text>
    </Stack>
  );
}
