import { useEffect, useState } from 'react';
import { Box, Button, Field, Input, Stack } from '@chakra-ui/react';
import { LuPlus } from 'react-icons/lu';
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
import { toaster } from '../ui/toaster';
import { useCreateProject } from '../../api';
import { DIALOG_SIZE } from '../../theme';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/** Модалка створення нового проекту (лише назва). */
export function ProjectCreateDialog({ open, onOpenChange }: Props) {
  const [name, setName] = useState('');
  const createProject = useCreateProject();

  useEffect(() => {
    if (open) setName('');
  }, [open]);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    createProject.mutate(trimmed, {
      onSuccess: () => {
        onOpenChange(false);
        toaster.create({ type: 'success', title: 'Проект створено', description: trimmed });
      },
      onError: (err) =>
        toaster.create({
          type: 'error',
          title: 'Помилка створення',
          description: err instanceof Error ? err.message : String(err),
        }),
    });
  }

  return (
    <DialogRoot
      open={open}
      onOpenChange={(d) => onOpenChange(d.open)}
      size={DIALOG_SIZE.form}
      placement="center"
    >
      <DialogBackdrop />
      <DialogContent>
        <DialogCloseTrigger />
        <DialogHeader>
          <DialogTitle>Новий проект</DialogTitle>
        </DialogHeader>
        <Box as="form" onSubmit={submit}>
          <DialogBody>
            <Stack gap={3}>
              <Field.Root required>
                <Field.Label>
                  Назва <Field.RequiredIndicator />
                </Field.Label>
                <Input
                  size="sm"
                  placeholder="напр. Телефони"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </Field.Root>
            </Stack>
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Скасувати
            </Button>
            <Button
              type="submit"
              colorPalette="accent"
              loading={createProject.isPending}
              disabled={!name.trim()}
            >
              <LuPlus /> Створити
            </Button>
          </DialogFooter>
        </Box>
      </DialogContent>
    </DialogRoot>
  );
}
