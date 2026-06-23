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
  projectName: string;
  isPending: boolean;
  onConfirm: () => void;
}

/** Alert-діалог підтвердження видалення проекту. Пошуки НЕ видаляються — переходять у «Без проекту». */
export function ProjectDeleteDialog({
  open,
  onOpenChange,
  projectName,
  isPending,
  onConfirm,
}: Props) {
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
          <DialogTitle>Видалити проект «{projectName}»?</DialogTitle>
        </DialogHeader>
        <DialogBody>
          <Text>
            Пошуки цього проекту НЕ будуть видалені — вони повернуться до групи «Без проекту».
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
