import { useEffect, useState } from 'react';
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
} from '../../ui/dialog';
import { Checkbox } from '../../ui/checkbox';

interface Props {
  open: boolean;
  onClose: () => void;
  names: string[];
  /** Скільки оголошень містить ці формулювання (назви + синоніми). */
  affected: number;
  pending: boolean;
  onConfirm: (withListings: boolean) => void;
}

/** Підтвердження видалення критеріїв: зі списку пошуку і (за галочкою) з оголошень та локальних фільтрів. */
export function DeleteCriteriaDialog({ open, onClose, names, affected, pending, onConfirm }: Props) {
  const [withListings, setWithListings] = useState(true);

  useEffect(() => {
    if (open) setWithListings(true);
  }, [open]);

  return (
    <DialogRoot
      role="alertdialog"
      open={open}
      onOpenChange={(d) => !d.open && onClose()}
      size="sm"
      placement="center"
      // Поверх вікна «Критерії пошуку» — див. ConfirmActionDialog (modal=false).
      modal={false}
    >
      <DialogBackdrop />
      <DialogContent>
        <DialogCloseTrigger />
        <DialogHeader>
          <DialogTitle>Видалити критерії ({names.length})?</DialogTitle>
        </DialogHeader>
        <DialogBody>
          <Stack gap={3}>
            <Text textStyle="sm">{names.join(' · ')}</Text>
            <Checkbox
              checked={withListings}
              disabled={affected === 0}
              onCheckedChange={(d) => setWithListings(d.checked === true)}
            >
              Прибрати також з {affected} оголошень і локальних фільтрів
            </Checkbox>
            {!withListings && affected > 0 && (
              <Text textStyle="xs" color="fg.muted">
                В оголошеннях пункти лишаться — у вікні їх буде видно як «лише в оголошеннях».
              </Text>
            )}
          </Stack>
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={onClose}>
            Скасувати
          </Button>
          <Button size="sm" colorPalette="danger" loading={pending} onClick={() => onConfirm(withListings)}>
            Видалити
          </Button>
        </DialogFooter>
      </DialogContent>
    </DialogRoot>
  );
}
