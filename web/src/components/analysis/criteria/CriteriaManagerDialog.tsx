import { useEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import { Box, Button, HStack, IconButton, Input, Spinner, Stack, Text } from '@chakra-ui/react';
import { LuCombine, LuPlus, LuSearch, LuTrash2, LuWandSparkles } from 'react-icons/lu';
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
import { toaster } from '../../ui/toaster';
import { ManualAssistant } from '../ManualAssistant';
import { CriterionRow } from './CriterionRow';
import { MergeCriteriaDialog } from './MergeCriteriaDialog';
import { DeleteCriteriaDialog } from './DeleteCriteriaDialog';
import { NewCriteriaDialog } from './NewCriteriaDialog';
import { useAnalysisStatus } from '../../../api';
import { useCriteriaManager } from '../../../hooks/analysis/useCriteriaManager';
import { useIsMobile } from '../../../hooks/useIsMobile';
import { MODE_LABELS } from '../../../constants';
import type { CriterionRowData } from '../../../hooks/analysis/useCriteriaManager';
import type { AnalysisMode, Search } from '../../../types';

interface Props {
  search: Search;
  open: boolean;
  onClose: () => void;
  initialMode?: AnalysisMode;
  /**
   * Відкрито поверх іншої модалки (майстра): її контент. Вікно рендериться всередині її DOM і з modal=false —
   * інакше фокус-пастка нижньої модалки не пускає фокус у поля вікна.
   */
  portalRef?: RefObject<HTMLElement | null>;
}

const MODE_PALETTE: Record<AnalysisMode, string> = { cons: 'danger', pros: 'success' };

/** Відкритий підділог: об'єднання/перейменування або видалення з обраними формулюваннями. */
type SubDialog = { kind: 'merge' | 'rename' | 'delete'; names: string[] } | null;

/**
 * Вікно «Плюси та мінуси» (docs/plans/criteria-categories.md): перегляд усіх мінусів/плюсів пошуку,
 * додавання й генерація, позначка «в аналізі», перейменування, видалення та об'єднання синонімічних
 * формулювань у категорію — без майстра AI-аналізу. Входи: меню пошуку, хаб AI, крок 1 майстра.
 */
export function CriteriaManagerDialog({ search, open, onClose, initialMode = 'cons', portalRef }: Props) {
  const isMobile = useIsMobile();
  const m = useCriteriaManager(search.id, open, initialMode);
  const { data: status } = useAnalysisStatus();
  const apiAvailable = status?.apiAvailable ?? false;
  const [customInput, setCustomInput] = useState('');
  const [sub, setSub] = useState<SubDialog>(null);
  const contentRef = useRef<HTMLDivElement>(null);

  // Відкриття з майстра — на режимі майстра.
  const { setMode } = m;
  useEffect(() => {
    if (open) setMode(initialMode);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initialMode]);

  const palette = MODE_PALETTE[m.mode];
  const busy = m.savePending || m.remapPending;
  const selectedNames = [...m.selected];
  const subAliases = (sub?.names ?? []).flatMap((n) => m.groups.find((g) => g.name === n)?.aliases ?? []);

  async function addCustom() {
    const c = customInput.trim();
    if (!c) return;
    try {
      const added = await m.addPhrases([c]);
      if (added === 0) toaster.create({ type: 'info', title: 'Такий критерій уже є (назва чи синонім категорії)' });
      setCustomInput('');
    } catch {
      // тост — у хуку
    }
  }

  async function confirmRemap(to: string | null, withListings = true) {
    if (!sub) return;
    if (await m.runRemap(sub.names, to, withListings)) setSub(null);
  }

  const listedRow = (row: CriterionRowData) => (
    <CriterionRow
      key={row.name}
      row={row}
      colorPalette={palette}
      checked={m.selected.has(row.name)}
      onCheck={() => m.toggleSelected(row.name)}
      busy={busy}
      onToggleEnabled={() => m.toggleEnabled(row.name)}
      onRename={() => setSub({ kind: 'rename', names: [row.name] })}
      onDelete={() => setSub({ kind: 'delete', names: [row.name] })}
      onDetachAlias={(alias) => m.detachAlias(row.name, alias)}
      onAdd={() => {}}
    />
  );

  return (
    <DialogRoot
      open={open}
      onOpenChange={(d) => !d.open && onClose()}
      size={isMobile ? 'full' : 'lg'}
      placement="center"
      scrollBehavior="inside"
      modal={!portalRef}
      // Закриття — лише хрестиком (або Escape), не кліком повз вікно.
      closeOnInteractOutside={false}
    >
      <DialogBackdrop />
      <DialogContent ref={contentRef} portalRef={portalRef}>
        <DialogCloseTrigger />
        <DialogHeader>
          <Stack gap={3} w="full">
            <DialogTitle>Плюси та мінуси — {search.name}</DialogTitle>
            <HStack gap={2} wrap="wrap">
              {(['cons', 'pros'] as const).map((mode) => (
                <Button
                  key={mode}
                  size="xs"
                  colorPalette={MODE_PALETTE[mode]}
                  variant={m.mode === mode ? 'solid' : 'outline'}
                  onClick={() => m.setMode(mode)}
                >
                  {MODE_LABELS[mode]}
                </Button>
              ))}
              <HStack flex="1" minW="160px" gap={1}>
                <LuSearch />
                <Input size="xs" placeholder="фільтр" value={m.filter} onChange={(e) => m.setFilter(e.target.value)} />
              </HStack>
            </HStack>
          </Stack>
        </DialogHeader>

        <DialogBody pb={4}>
          <Stack gap={3}>
            <HStack gap={2}>
              <Input
                size="sm"
                placeholder="Додати свій критерій…"
                value={customInput}
                onChange={(e) => setCustomInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && void addCustom()}
              />
              <IconButton size="sm" variant="outline" aria-label="Додати" disabled={busy} onClick={() => void addCustom()}>
                <LuPlus />
              </IconButton>
            </HStack>
            <HStack gap={2} wrap="wrap">
              {apiAvailable && (
                <Button
                  size="sm"
                  colorPalette="purple"
                  onClick={m.generation.handleGenerate}
                  loading={m.generation.generatePending}
                >
                  <LuWandSparkles /> Згенерувати
                </Button>
              )}
              <Button size="sm" variant="outline" onClick={m.generation.openAssistant}>
                Згенерувати вручну
              </Button>
            </HStack>
            {m.generation.showAssistant && (
              <ManualAssistant
                title="Помічник: генерація критеріїв"
                parts={m.generation.assistantParts}
                pasteLabel="Розпізнати критерії"
                onSubmit={m.generation.handleImport}
                submitting={m.generation.importPending}
              />
            )}

            {m.isLoading ? (
              <Spinner size="sm" />
            ) : (
              <Box borderTopWidth="1px" borderColor="border.subtle">
                {m.rows.categories.length + m.rows.singles.length + m.rows.orphans.length === 0 && (
                  <Text textStyle="sm" color="fg.muted" py={3}>
                    {m.filter ? 'Нічого не знайдено.' : 'Критеріїв ще немає — згенеруй або додай вручну.'}
                  </Text>
                )}
                {m.rows.categories.length > 0 && <SectionLabel>Категорії (з синонімами)</SectionLabel>}
                {m.rows.categories.map(listedRow)}
                {m.rows.categories.length > 0 && m.rows.singles.length > 0 && (
                  <SectionLabel>Окремі критерії</SectionLabel>
                )}
                {m.rows.singles.map(listedRow)}
                {m.rows.orphans.length > 0 && (
                  <>
                    <SectionLabel>Лише в оголошеннях (не в списку критеріїв): старі прогони або ручні правки</SectionLabel>
                    {m.rows.orphans.map((row) => (
                      <CriterionRow
                        key={`orphan:${row.name}`}
                        row={row}
                        colorPalette={palette}
                        checked={m.selected.has(row.name)}
                        onCheck={() => m.toggleSelected(row.name)}
                        busy={busy}
                        onToggleEnabled={() => {}}
                        onRename={() => {}}
                        onDelete={() => {}}
                        onDetachAlias={() => {}}
                        onAdd={() => void m.addPhrases([row.name]).catch(() => {})}
                      />
                    ))}
                  </>
                )}
              </Box>
            )}
          </Stack>
        </DialogBody>

        <DialogFooter justifyContent="space-between" gap={2} flexWrap="wrap">
          <Text textStyle="sm" color="fg.muted">
            Обрано {selectedNames.length}
          </Text>
          <HStack gap={2}>
            <Button
              size="sm"
              colorPalette="accent"
              disabled={selectedNames.length === 0 || busy}
              onClick={() => setSub({ kind: selectedNames.length === 1 ? 'rename' : 'merge', names: selectedNames })}
            >
              <LuCombine /> Об'єднати в категорію…
            </Button>
            <Button
              size="sm"
              variant="outline"
              colorPalette="danger"
              disabled={selectedNames.length === 0 || busy}
              onClick={() => setSub({ kind: 'delete', names: selectedNames })}
            >
              <LuTrash2 /> Видалити
            </Button>
          </HStack>
        </DialogFooter>
      </DialogContent>

      {/* Монтуються лише на час показу: Ark Portal читає portalRef один раз при монтуванні. */}
      {(sub?.kind === 'merge' || sub?.kind === 'rename') && (
        <MergeCriteriaDialog
          portalRef={contentRef}
          open
          onClose={() => setSub(null)}
          title={sub.kind === 'rename' ? 'Перейменувати категорію' : "Об'єднати в категорію"}
          names={sub.names}
          aliases={subAliases}
          affected={m.affectedCount(sub.names)}
          pending={m.remapPending}
          onConfirm={(name) => void confirmRemap(name)}
        />
      )}
      {m.generation.candidates && (
        <NewCriteriaDialog
          portalRef={contentRef}
          candidates={m.generation.candidates}
          pending={m.generation.addPending}
          onAdd={(phrases) => void m.generation.addCandidates(phrases)}
          onClose={m.generation.dismissCandidates}
        />
      )}
      {sub?.kind === 'delete' && (
        <DeleteCriteriaDialog
          portalRef={contentRef}
          open
          onClose={() => setSub(null)}
          names={sub.names}
          affected={m.affectedCount(sub.names)}
          pending={m.remapPending}
          onConfirm={(withListings) => void confirmRemap(null, withListings)}
        />
      )}
    </DialogRoot>
  );
}

function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <Text textStyle="xs" color="fg.muted" fontWeight="semibold" pt={3} pb={1}>
      {children}
    </Text>
  );
}
