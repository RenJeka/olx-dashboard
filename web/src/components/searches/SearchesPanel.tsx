import { useEffect, useMemo, useState } from 'react';
import { Accordion, HStack, IconButton } from '@chakra-ui/react';
import { LuArchive, LuFolderPlus, LuListChecks, LuPlus } from 'react-icons/lu';
import { SearchGroupAccordionItem } from './SearchGroupAccordionItem';
import { ProjectAccordionItem } from './ProjectAccordionItem';
import { ProjectCreateDialog } from './ProjectCreateDialog';
import { Tooltip } from '../ui/tooltip';
import { useSettingsStore } from '../../stores/settingsStore';
import type { Project, Search } from '../../types';

interface Props {
  isLoading: boolean;
  projects: Project[];
  activeSearches: Search[];
  archivedSearches: Search[];
  selectedId: number | null;
  onSelect: (id: number) => void;
  onDeleted: (id: number) => void;
  onNewSearch: () => void;
}

/**
 * Вміст бічної панелі: кнопки «Новий пошук»/«Новий проект» + акордеон проектів,
 * групи «Без проекту» та «Архів» (опц.).
 */
export function SearchesPanel({
  isLoading,
  projects,
  activeSearches,
  archivedSearches,
  selectedId,
  onSelect,
  onDeleted,
  onNewSearch,
}: Props) {
  const [createProjectOpen, setCreateProjectOpen] = useState(false);
  
  const expandedGroups = useSettingsStore((s) => s.expandedSearchGroups);
  const setExpandedGroups = useSettingsStore((s) => s.setExpandedSearchGroups);

  // Групуємо активні (не архівні) пошуки за project_id.
  const ungrouped = useMemo(
    () => activeSearches.filter((s) => s.project_id == null),
    [activeSearches],
  );
  const byProject = useMemo(() => {
    const map = new Map<number, Search[]>();
    for (const s of activeSearches) {
      if (s.project_id == null) continue;
      const list = map.get(s.project_id) ?? [];
      list.push(s);
      map.set(s.project_id, list);
    }
    return map;
  }, [activeSearches]);

  const accordionValue = useMemo(() => {
    if (expandedGroups !== null) return expandedGroups;
    
    // За замовчуванням (до першої взаємодії) розгортаємо ТІЛЬКИ той проект, до якого належить вибраний пошук.
    if (selectedId != null) {
      const selectedSearch =
        activeSearches.find((s) => s.id === selectedId) ||
        archivedSearches.find((s) => s.id === selectedId);

      if (selectedSearch) {
        return [
          selectedSearch.archived === 1
            ? 'archive'
            : selectedSearch.project_id != null
              ? `project-${selectedSearch.project_id}`
              : 'ungrouped'
        ];
      }
    }
    
    return [];
  }, [expandedGroups, selectedId, activeSearches, archivedSearches]);

  useEffect(() => {
    if (selectedId != null) {
      const selectedSearch =
        activeSearches.find((s) => s.id === selectedId) ||
        archivedSearches.find((s) => s.id === selectedId);

      if (selectedSearch) {
        const groupValue =
          selectedSearch.archived === 1
            ? 'archive'
            : selectedSearch.project_id != null
              ? `project-${selectedSearch.project_id}`
              : 'ungrouped';

        if (!accordionValue.includes(groupValue)) {
          setExpandedGroups([...accordionValue, groupValue]);
        }
      }
    }
  }, [selectedId, accordionValue, activeSearches, archivedSearches, setExpandedGroups]);

  return (
    <>
      <HStack justify="flex-end" px={4} py={3} gap={2}>
        <Tooltip content="Новий проект">
          <IconButton
            aria-label="Новий проект"
            rounded="full"
            size="lg"
            colorPalette="purple"
            variant="outline"
            shadow="sm"
            onClick={() => setCreateProjectOpen(true)}
          >
            <LuFolderPlus />
          </IconButton>
        </Tooltip>
        <Tooltip content="Новий пошук">
          <IconButton
            aria-label="Новий пошук"
            rounded="full"
            size="lg"
            colorPalette="success"
            variant="solid"
            shadow="md"
            onClick={onNewSearch}
          >
            <LuPlus />
          </IconButton>
        </Tooltip>
      </HStack>

      <Accordion.Root
        multiple
        value={accordionValue}
        onValueChange={(e) => setExpandedGroups(e.value)}
        variant="plain"
      >
        {projects.map((project, index) => (
          <ProjectAccordionItem
            key={project.id}
            project={project}
            items={byProject.get(project.id) ?? []}
            selectedId={selectedId}
            onSelect={onSelect}
            onDeleted={onDeleted}
            isFirst={index === 0}
            isLast={index === projects.length - 1}
          />
        ))}

        <SearchGroupAccordionItem
          value="ungrouped"
          icon={<LuListChecks />}
          label={projects.length > 0 ? 'Без проекту' : 'Пошуки'}
          badgeColorPalette="accent"
          items={ungrouped}
          selectedId={selectedId}
          onSelect={onSelect}
          onDeleted={onDeleted}
          isLoading={isLoading}
          emptyMessage="Поки що порожньо — додай перший пошук вгорі."
        />

        {archivedSearches.length > 0 && (
          <SearchGroupAccordionItem
            value="archive"
            icon={<LuArchive />}
            label="Архів"
            badgeColorPalette="gray"
            items={archivedSearches}
            selectedId={selectedId}
            onSelect={onSelect}
            onDeleted={onDeleted}
          />
        )}
      </Accordion.Root>

      <ProjectCreateDialog open={createProjectOpen} onOpenChange={setCreateProjectOpen} />
    </>
  );
}
