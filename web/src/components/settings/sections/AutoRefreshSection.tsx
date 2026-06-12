import { Heading, HStack, NativeSelect, Stack, Text } from '@chakra-ui/react';
import { LuTimer } from 'react-icons/lu';
import { Switch } from '../../ui/switch';

interface AutoRefreshSectionProps {
  autoRefreshEnabled: boolean;
  onAutoRefreshEnabledChange: (value: boolean) => void;
  autoRefreshIntervalMin: number;
  onAutoRefreshIntervalMinChange: (value: number) => void;
}

export function AutoRefreshSection({
  autoRefreshEnabled,
  onAutoRefreshEnabledChange,
  autoRefreshIntervalMin,
  onAutoRefreshIntervalMinChange,
}: AutoRefreshSectionProps) {
  return (
    <Stack gap={3}>
      <Heading size="sm">Автооновлення</Heading>
      <Switch
        checked={autoRefreshEnabled}
        onCheckedChange={(details) => onAutoRefreshEnabledChange(details.checked)}
      >
        <HStack gap={1}>
          <LuTimer />
          <Text>Автоматично сканувати всі пошуки</Text>
        </HStack>
      </Switch>
      <NativeSelect.Root size="sm" w="40" disabled={!autoRefreshEnabled}>
        <NativeSelect.Field
          value={String(autoRefreshIntervalMin)}
          onChange={(e) => onAutoRefreshIntervalMinChange(Number(e.target.value))}
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
