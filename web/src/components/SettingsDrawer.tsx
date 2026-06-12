import { Heading, HStack, IconButton, NativeSelect, Separator, Stack, Text } from '@chakra-ui/react';
import type { OnChangeFn, VisibilityState } from '@tanstack/react-table';
import { LuFileText, LuMoon, LuSettings, LuSun, LuTimer } from 'react-icons/lu';
import { TOGGLEABLE_COLUMNS } from '../pages/ListingsTable';
import { Checkbox } from './ui/checkbox';
import { useColorMode } from './ui/color-mode';
import {
  DrawerBackdrop,
  DrawerBody,
  DrawerCloseTrigger,
  DrawerContent,
  DrawerHeader,
  DrawerRoot,
  DrawerTitle,
  DrawerTrigger,
} from './ui/drawer';
import { Switch } from './ui/switch';
import { Tooltip } from './ui/tooltip';

interface Props {
  columnVisibility: VisibilityState;
  onColumnVisibilityChange: OnChangeFn<VisibilityState>;
  descriptionExpandEnabled: boolean;
  onDescriptionExpandEnabledChange: (value: boolean) => void;
  autoRefreshEnabled: boolean;
  onAutoRefreshEnabledChange: (value: boolean) => void;
  autoRefreshIntervalMin: number;
  onAutoRefreshIntervalMinChange: (value: number) => void;
}

export function SettingsDrawer({
  columnVisibility,
  onColumnVisibilityChange,
  descriptionExpandEnabled,
  onDescriptionExpandEnabledChange,
  autoRefreshEnabled,
  onAutoRefreshEnabledChange,
  autoRefreshIntervalMin,
  onAutoRefreshIntervalMinChange,
}: Props) {
  const { colorMode, toggleColorMode } = useColorMode();

  return (
    <DrawerRoot size="sm">
      <Tooltip content="Налаштування">
        <DrawerTrigger asChild>
          <IconButton aria-label="Налаштування" variant="ghost">
            <LuSettings />
          </IconButton>
        </DrawerTrigger>
      </Tooltip>
      <DrawerBackdrop />
      <DrawerContent>
        <DrawerCloseTrigger />
        <DrawerHeader>
          <LuSettings size="24" />
          <DrawerTitle ml="4">Налаштування</DrawerTitle>
        </DrawerHeader>
        <Separator />
        <DrawerBody mt="4">
          <Stack gap={6}>
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
            <Stack gap={3}>
              <Text fontWeight="medium">Колонки таблиці</Text>
              <Stack gap={2}>
                {TOGGLEABLE_COLUMNS.map((col) => (
                  <Checkbox
                    key={col.id}
                    checked={columnVisibility[col.id] !== false}
                    onCheckedChange={(details) =>
                      onColumnVisibilityChange((prev) => ({
                        ...prev,
                        [col.id]: details.checked === true,
                      }))
                    }
                  >
                    {col.label}
                  </Checkbox>
                ))}
              </Stack>
            </Stack>
          </Stack>
        </DrawerBody>
      </DrawerContent>
    </DrawerRoot>
  );
}
