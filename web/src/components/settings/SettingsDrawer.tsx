import { IconButton, Separator, Stack } from '@chakra-ui/react';
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
import { AnalysisSection } from './sections/AnalysisSection';
import { DRAWER_SIZE } from '../../theme';

export function SettingsDrawer() {
  return (
    <DrawerRoot size={DRAWER_SIZE.default}>
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
            <VisualSection />
            <Separator width="80%" alignSelf="center" />
            <AutoRefreshSection />
            <Separator width="80%" alignSelf="center" />
            <AnalysisSection />
            <Separator width="80%" alignSelf="center" />
            <ColumnsSection />
          </Stack>
        </DrawerBody>
      </DrawerContent>
    </DrawerRoot>
  );
}
