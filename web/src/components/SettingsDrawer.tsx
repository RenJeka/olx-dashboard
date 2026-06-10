import { Heading, HStack, IconButton, Stack, Text } from '@chakra-ui/react';
import type { OnChangeFn, VisibilityState } from '@tanstack/react-table';
import { LuMoon, LuSettings, LuSun } from 'react-icons/lu';
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
}

export function SettingsDrawer({ columnVisibility, onColumnVisibilityChange }: Props) {
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
          <DrawerTitle>Налаштування</DrawerTitle>
        </DrawerHeader>
        <DrawerBody>
          <Stack gap={6}>
            <Stack gap={3}>
              <Heading size="sm">Візуальний вигляд</Heading>
              <Switch checked={colorMode === 'dark'} onCheckedChange={() => toggleColorMode()}>
                <HStack gap={1}>
                  {colorMode === 'dark' ? <LuMoon /> : <LuSun />}
                  <Text>Темна тема</Text>
                </HStack>
              </Switch>
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
