import { useState } from 'react';
import { Button, Stack, Text } from '@chakra-ui/react';
import {
  DialogBackdrop,
  DialogBody,
  DialogCloseTrigger,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogRoot,
  DialogTitle,
} from './ui/dialog';
import { Checkbox } from './ui/checkbox';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  confirmLabel: string;
  /** skipNextTime — стан чекбоксу «Більше не питати» на момент підтвердження. */
  onConfirm: (skipNextTime: boolean) => void;
}

/** Спільний діалог підтвердження довгої дії (глибокий скан / перевірка) з опцією «Більше не питати». */
export function ConfirmActionDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  onConfirm,
}: Props) {
  const [skip, setSkip] = useState(false);

  return (
    <DialogRoot
      role="alertdialog"
      placement="center"
      size="sm"
      open={open}
      onOpenChange={(d) => {
        if (!d.open) setSkip(false);
        onOpenChange(d.open);
      }}
    >
      <DialogBackdrop />
      <DialogContent>
        <DialogCloseTrigger />
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <DialogBody>
          <Stack gap={3}>
            <Text>{description}</Text>
            <Checkbox checked={skip} onCheckedChange={(d) => setSkip(d.checked === true)}>
              Більше не питати
            </Checkbox>
          </Stack>
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Скасувати
          </Button>
          <Button
            colorPalette="blue"
            onClick={() => {
              onConfirm(skip);
              onOpenChange(false);
            }}
          >
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </DialogRoot>
  );
}
