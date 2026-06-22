import { Button, Text } from '@chakra-ui/react';
import {
  DialogBackdrop,
  DialogBody,
  DialogCloseTrigger,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogRoot,
  DialogTitle,
} from '../ui/dialog';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  searchName: string;
  isPending: boolean;
  onConfirm: () => void;
}

/** Alert-діалог підтвердження видалення пошуку (каскадно видаляє оголошення/історію цін). */
export function SearchDeleteDialog({ open, onOpenChange, searchName, isPending, onConfirm }: Props) {
  return (
    <DialogRoot
      role="alertdialog"
      placement="center"
      size="sm"
      open={open}
      onOpenChange={(d) => onOpenChange(d.open)}
    >
      <DialogBackdrop />
      <DialogContent>
        <DialogCloseTrigger />
        <DialogHeader>
          <DialogTitle>Видалити пошук «{searchName}»?</DialogTitle>
        </DialogHeader>
        <DialogBody>
          <Text>
            Усі збережені оголошення та історія цін для цього пошуку також будуть видалені
            безповоротно.
          </Text>
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Скасувати
          </Button>
          <Button colorPalette="danger" loading={isPending} onClick={onConfirm}>
            Видалити
          </Button>
        </DialogFooter>
      </DialogContent>
    </DialogRoot>
  );
}
