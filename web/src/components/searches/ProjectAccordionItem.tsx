import { useState } from 'react';
import { Accordion, Badge, HStack, IconButton, Menu, Portal, Stack, Text } from '@chakra-ui/react';
import {
  LuChevronDown,
  LuChevronUp,
  LuEllipsisVertical,
  LuFolder,
  LuPencil,
  LuTrash2,
} from 'react-icons/lu';
import { SearchRow } from './SearchRow';
import { ProjectEditDialog } from './ProjectEditDialog';
import { ProjectDeleteDialog } from './ProjectDeleteDialog';
import { Tooltip } from '../ui/tooltip';
import { useDeleteProject, useReorderProjects } from '../../api';
import { toaster } from '../ui/toaster';
import type { Project, Search } from '../../types';

interface Props {
  project: Project;
  items: Search[];
  selectedId: number | null;
  onSelect: (id: number) => void;
  onDeleted: (id: number) => void;
  isFirst: boolean;
  isLast: boolean;
}

/** Акордеон-секція одного проекту: меню (перейменувати/видалити), реордер, список пошуків. */
export function ProjectAccordionItem({
  project,
  items,
  selectedId,
  onSelect,
  onDeleted,
  isFirst,
  isLast,
}: Props) {
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const deleteProject = useDeleteProject();
  const reorderProject = useReorderProjects();

  function handleMove(direction: 'up' | 'down') {
    reorderProject.mutate({ projectId: project.id, direction });
  }

  function confirmDelete() {
    deleteProject.mutate(project.id, {
      onSuccess: () => {
        setDeleteOpen(false);
        toaster.create({ type: 'success', title: 'Проект видалено', description: project.name });
      },
      onError: (err) =>
        toaster.create({
          type: 'error',
          title: 'Помилка видалення',
          description: err instanceof Error ? err.message : String(err),
        }),
    });
  }

  return (
    <Accordion.Item
      value={`project-${project.id}`}
      borderBottomWidth="1px"
      borderColor="border.subtle"
    >
      {/* Контроли поза тригером (тригер — це <button>, вкладені кнопки невалідні). */}
      <HStack gap={0} pr={2} _hover={{ bg: 'bg.muted' }}>
        <Accordion.ItemTrigger flex="1" px={4} py={3} cursor="pointer" bg="transparent">
          <HStack flex="1" gap={2} fontWeight="semibold" minW={0}>
            <LuFolder />
            <Text overflow="hidden" textOverflow="ellipsis" whiteSpace="nowrap">
              {project.name}
            </Text>
            {items.length > 0 && (
              <Badge colorPalette="purple" variant="subtle" rounded="full">
                {items.length}
              </Badge>
            )}
          </HStack>
          <Accordion.ItemIndicator />
        </Accordion.ItemTrigger>

        <Tooltip content="Пересунути вгору">
          <IconButton
            aria-label="Пересунути проект вгору"
            size="2xs"
            variant="ghost"
            disabled={isFirst || reorderProject.isPending}
            onClick={() => handleMove('up')}
          >
            <LuChevronUp />
          </IconButton>
        </Tooltip>
        <Tooltip content="Пересунути вниз">
          <IconButton
            aria-label="Пересунути проект вниз"
            size="2xs"
            variant="ghost"
            disabled={isLast || reorderProject.isPending}
            onClick={() => handleMove('down')}
          >
            <LuChevronDown />
          </IconButton>
        </Tooltip>

        <Menu.Root positioning={{ placement: 'bottom-end' }}>
          <Menu.Trigger asChild>
            <IconButton aria-label="Дії з проектом" size="2xs" variant="ghost">
              <LuEllipsisVertical />
            </IconButton>
          </Menu.Trigger>
          <Portal>
            <Menu.Positioner>
              <Menu.Content>
                <Menu.Item value="rename" onSelect={() => setEditOpen(true)}>
                  <HStack gap={2}>
                    <LuPencil /> <Text>Перейменувати</Text>
                  </HStack>
                </Menu.Item>
                <Menu.Separator />
                <Menu.Item value="delete" color="fg.error" onSelect={() => setDeleteOpen(true)}>
                  <HStack gap={2}>
                    <LuTrash2 /> <Text>Видалити</Text>
                  </HStack>
                </Menu.Item>
              </Menu.Content>
            </Menu.Positioner>
          </Portal>
        </Menu.Root>
      </HStack>

      <Accordion.ItemContent>
        <Accordion.ItemBody px={2} pt={0} pb={2}>
          {items.length === 0 && (
            <Text textStyle="sm" color="fg.muted" px={2}>
              Порожньо — перемісти сюди пошук через меню «⋮ → Перемістити в проект».
            </Text>
          )}
          <Stack gap="0.5">
            {items.map((s, index) => (
              <SearchRow
                key={s.id}
                search={s}
                selected={selectedId === s.id}
                isFirst={index === 0}
                isLast={index === items.length - 1}
                onSelect={() => onSelect(s.id)}
                onDeleted={() => onDeleted(s.id)}
              />
            ))}
          </Stack>
        </Accordion.ItemBody>
      </Accordion.ItemContent>

      <ProjectEditDialog open={editOpen} onOpenChange={setEditOpen} project={project} />
      <ProjectDeleteDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        projectName={project.name}
        isPending={deleteProject.isPending}
        onConfirm={confirmDelete}
      />
    </Accordion.Item>
  );
}
