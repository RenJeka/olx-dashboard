import { useEffect, useState } from 'react';
import { Box, Button, Field, Input, Stack } from '@chakra-ui/react';
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
import { useUpdateProject } from '../../api';
import { DIALOG_SIZE } from '../../theme';
import type { Project } from '../../types';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  project: Project;
}

/** Модалка перейменування проекту. */
export function ProjectEditDialog({ open, onOpenChange, project }: Props) {
  const [name, setName] = useState('');
  const updateProject = useUpdateProject();

  useEffect(() => {
    if (open) setName(project.name);
  }, [open, project]);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    updateProject.mutate(
      { projectId: project.id, name: trimmed },
      {
        onSuccess: () => {
          onOpenChange(false);
          toaster.create({ type: 'success', title: 'Проект оновлено', description: trimmed });
        },
        onError: (err) =>
          toaster.create({
            type: 'error',
            title: 'Помилка оновлення',
            description: err instanceof Error ? err.message : String(err),
          }),
      },
    );
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
          <DialogTitle>Перейменувати проект</DialogTitle>
        </DialogHeader>
        <Box as="form" onSubmit={submit}>
          <DialogBody>
            <Stack gap={3}>
              <Field.Root required>
                <Field.Label>
                  Назва <Field.RequiredIndicator />
                </Field.Label>
                <Input size="sm" value={name} onChange={(e) => setName(e.target.value)} />
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
              loading={updateProject.isPending}
              disabled={!name.trim()}
            >
              Зберегти
            </Button>
          </DialogFooter>
        </Box>
      </DialogContent>
    </DialogRoot>
  );
}
