import { useState } from 'react';
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
import { BaseCriteriaDialog } from '../analysis/base/BaseCriteriaDialog';
import { DRAWER_SIZE } from '../../theme';

export function SettingsDrawer() {
  const [open, setOpen] = useState(false);
  // Вікно «Базові плюси й мінуси» відкривається ЗАМІСТЬ панелі: спершу панель закривається, вікно монтується
  // після її анімації (docs/instructions/chakra-nested-dialog-focus.md, п. 4) — інакше фокус-пастка панелі
  // не пускає в поля вікна.
  const [baseAfterClose, setBaseAfterClose] = useState(false);
  const [baseOpen, setBaseOpen] = useState(false);

  return (
    <>
      <DrawerRoot
        size={DRAWER_SIZE.default}
        open={open}
        onOpenChange={(d) => setOpen(d.open)}
        onExitComplete={() => {
          if (baseAfterClose) setBaseOpen(true);
          setBaseAfterClose(false);
        }}
      >
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
              <AnalysisSection
                onOpenBaseCriteria={() => {
                  setBaseAfterClose(true);
                  setOpen(false);
                }}
              />
              <Separator width="80%" alignSelf="center" />
              <ColumnsSection />
            </Stack>
          </DrawerBody>
        </DrawerContent>
      </DrawerRoot>
      {baseOpen && <BaseCriteriaDialog onClose={() => setBaseOpen(false)} />}
    </>
  );
}
