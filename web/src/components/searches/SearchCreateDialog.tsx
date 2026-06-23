import { Box, Button, Field, HStack, Input, NativeSelect, Stack, Text } from '@chakra-ui/react';
import { LuLayers, LuPlus } from 'react-icons/lu';
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
import type { NewSearchFormState } from '../../hooks/useNewSearchForm';
import { useProjects } from '../../api';
import { DIALOG_SIZE } from '../../theme';

interface Props {
  open: boolean;
  onClose: () => void;
  form: NewSearchFormState;
}

/** Модалка створення нового пошуку (назва/запит/ціна/варіанти). Контрольована — тригер на боці виклика. */
export function SearchCreateDialog({ open, onClose, form }: Props) {
  const { data: projects } = useProjects();
  const {
    name,
    setName,
    query,
    setQuery,
    priceFrom,
    setPriceFrom,
    priceTo,
    setPriceTo,
    synonyms,
    setVariantsOpen,
    projectId,
    setProjectId,
    submit,
    createSearch,
  } = form;

  return (
    <DialogRoot
      open={open}
      onOpenChange={(d) => {
        if (!d.open) onClose();
      }}
      size={DIALOG_SIZE.form}
      placement="center"
      scrollBehavior="inside"
    >
      <DialogBackdrop />
      <DialogContent>
        <DialogCloseTrigger />
        <DialogHeader>
          <DialogTitle>Новий пошук</DialogTitle>
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
                  placeholder="напр. iPhone 13 Київ"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </Field.Root>
              <Field.Root required>
                <Field.Label>
                  Запит <Field.RequiredIndicator />
                </Field.Label>
                <Input
                  size="sm"
                  placeholder="напр. iphone 13"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
              </Field.Root>
              <Button
                size="xs"
                variant="outline"
                alignSelf="start"
                disabled={!query.trim()}
                onClick={() => setVariantsOpen(true)}
              >
                <LuLayers /> Варіанти пошуку{synonyms.length > 0 ? ` (${synonyms.length})` : ''}
              </Button>
              <Field.Root>
                <Field.Label>Проект (категорія)</Field.Label>
                <NativeSelect.Root size="sm">
                  <NativeSelect.Field
                    cursor="pointer"
                    value={projectId ?? ''}
                    onChange={(e) => setProjectId(e.target.value ? Number(e.target.value) : null)}
                  >
                    <option value="">Без проекту</option>
                    {projects?.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </NativeSelect.Field>
                  <NativeSelect.Indicator />
                </NativeSelect.Root>
              </Field.Root>
              <HStack gap={2}>
                <Field.Root>
                  <Field.Label>Ціна від</Field.Label>
                  <Input
                    size="sm"
                    inputMode="numeric"
                    value={priceFrom}
                    onChange={(e) => setPriceFrom(e.target.value)}
                  />
                </Field.Root>
                <Field.Root>
                  <Field.Label>Ціна до</Field.Label>
                  <Input
                    size="sm"
                    inputMode="numeric"
                    value={priceTo}
                    onChange={(e) => setPriceTo(e.target.value)}
                  />
                </Field.Root>
              </HStack>
              {createSearch.isError && (
                <Text textStyle="xs" color="fg.error">
                  {createSearch.error instanceof Error
                    ? createSearch.error.message
                    : 'Помилка створення'}
                </Text>
              )}
            </Stack>
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" onClick={onClose}>
              Скасувати
            </Button>
            <Button
              type="submit"
              colorPalette="accent"
              loading={createSearch.isPending}
              disabled={!name.trim() || !query.trim()}
            >
              <LuPlus /> Створити
            </Button>
          </DialogFooter>
        </Box>
      </DialogContent>
    </DialogRoot>
  );
}
