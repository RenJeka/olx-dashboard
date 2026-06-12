import { IconButton, Separator, Stack } from '@chakra-ui/react';
import type { OnChangeFn, VisibilityState } from '@tanstack/react-table';
import { LuSettings } from 'react-icons/lu';
import {
  DrawerBackdrop,
  DrawerBody,
  DrawerCloseTrigger,
  DrawerContent,
  DrawerHeader,
  DrawerRoot,
  DrawerTitle,
  DrawerTrigger,
} from '../ui/drawer';
import { Tooltip } from '../ui/tooltip';
import { VisualSection } from './sections/VisualSection';
import { AutoRefreshSection } from './sections/AutoRefreshSection';
import { ColumnsSection } from './sections/ColumnsSection';

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
          <Stack gap={8}>
            <VisualSection
              descriptionExpandEnabled={descriptionExpandEnabled}
              onDescriptionExpandEnabledChange={onDescriptionExpandEnabledChange}
            />
            <Separator width="80%" alignSelf="center" />
            <AutoRefreshSection
              autoRefreshEnabled={autoRefreshEnabled}
              onAutoRefreshEnabledChange={onAutoRefreshEnabledChange}
              autoRefreshIntervalMin={autoRefreshIntervalMin}
              onAutoRefreshIntervalMinChange={onAutoRefreshIntervalMinChange}
            />
            <Separator width="80%" alignSelf="center" />
            <ColumnsSection
              columnVisibility={columnVisibility}
              onColumnVisibilityChange={onColumnVisibilityChange}
            />
          </Stack>
        </DrawerBody>
      </DrawerContent>
    </DrawerRoot>
  );
}
