import { HStack, IconButton, Menu, Portal, Text } from '@chakra-ui/react';
import {
  LuArchive,
  LuArchiveRestore,
  LuCheck,
  LuEllipsisVertical,
  LuFilter,
  LuFolderInput,
  LuLayers,
  LuPencil,
  LuTrash2,
} from 'react-icons/lu';
import type { Project } from '../../types';

interface Props {
  isArchived: boolean;
  synonymsCount: number;
  projects: Project[];
  currentProjectId: number | null;
  onAssignProject: (projectId: number | null) => void;
  onEdit: () => void;
  onFilters: () => void;
  onVariants: () => void;
  onArchiveToggle: () => void;
  onDeleteRequest: () => void;
}

/** Меню дій рядка пошуку (3-dot): редагувати/фільтри/варіанти/проект/архів/видалення. */
export function SearchRowMenu({
  isArchived,
  synonymsCount,
  projects,
  currentProjectId,
  onAssignProject,
  onEdit,
  onFilters,
  onVariants,
  onArchiveToggle,
  onDeleteRequest,
}: Props) {
  return (
    <Menu.Root positioning={{ placement: 'bottom-end' }}>
      <Menu.Trigger asChild>
        <IconButton
          aria-label="Дії з пошуком"
          size="2xs"
          variant="ghost"
          onClick={(e) => e.stopPropagation()}
        >
          <LuEllipsisVertical />
        </IconButton>
      </Menu.Trigger>
      <Portal>
        <Menu.Positioner>
          <Menu.Content onClick={(e) => e.stopPropagation()}>
            <Menu.Item value="edit" onSelect={onEdit}>
              <HStack gap={2}>
                <LuPencil /> <Text>Редагувати</Text>
              </HStack>
            </Menu.Item>
            <Menu.Item value="filters" onSelect={onFilters}>
              <HStack gap={2}>
                <LuFilter /> <Text>Фільтри</Text>
              </HStack>
            </Menu.Item>
            <Menu.Item value="variants" onSelect={onVariants}>
              <HStack gap={2}>
                <LuLayers /> <Text>Варіанти пошуку{synonymsCount > 0 ? ` (${synonymsCount})` : ''}</Text>
              </HStack>
            </Menu.Item>

            <Menu.Root positioning={{ placement: 'right-start', gutter: 4 }}>
              <Menu.TriggerItem>
                <HStack gap={2} flex="1">
                  <LuFolderInput /> <Text>Перемістити в проект</Text>
                </HStack>
              </Menu.TriggerItem>
              <Portal>
                <Menu.Positioner>
                  <Menu.Content>
                    <Menu.Item
                      value="__none__"
                      onSelect={() => onAssignProject(null)}
                      disabled={currentProjectId == null}
                    >
                      <HStack gap={2} flex="1" justify="space-between">
                        <Text>Без проекту</Text>
                        {currentProjectId == null && <LuCheck />}
                      </HStack>
                    </Menu.Item>
                    {projects.length > 0 && <Menu.Separator />}
                    {projects.map((p) => (
                      <Menu.Item
                        key={p.id}
                        value={String(p.id)}
                        onSelect={() => onAssignProject(p.id)}
                        disabled={currentProjectId === p.id}
                      >
                        <HStack gap={2} flex="1" justify="space-between">
                          <Text overflow="hidden" textOverflow="ellipsis" whiteSpace="nowrap">
                            {p.name}
                          </Text>
                          {currentProjectId === p.id && <LuCheck />}
                        </HStack>
                      </Menu.Item>
                    ))}
                  </Menu.Content>
                </Menu.Positioner>
              </Portal>
            </Menu.Root>

            <Menu.Item value="archive" onSelect={onArchiveToggle}>
              <HStack gap={2}>
                {isArchived ? <LuArchiveRestore /> : <LuArchive />}{' '}
                <Text>{isArchived ? 'Повернути з архіву' : 'Архівувати'}</Text>
              </HStack>
            </Menu.Item>
            <Menu.Separator />
            <Menu.Item value="delete" color="fg.error" onSelect={onDeleteRequest}>
              <HStack gap={2}>
                <LuTrash2 /> <Text>Видалити</Text>
              </HStack>
            </Menu.Item>
          </Menu.Content>
        </Menu.Positioner>
      </Portal>
    </Menu.Root>
  );
}
