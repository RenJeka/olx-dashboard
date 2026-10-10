import { useEffect, useState } from 'react';
import { Box, Button, HStack, IconButton, Input, Spinner, Stack, Text } from '@chakra-ui/react';
import { LuCombine, LuPlus, LuRefreshCw, LuSearch, LuTrash2, LuWandSparkles } from 'react-icons/lu';
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
import { useAnalysisStatus } from '../../../api';
import { useCriteriaManager } from '../../../hooks/analysis/useCriteriaManager';
import { useIsMobile } from '../../../hooks/useIsMobile';
import { MODE_LABELS } from '../../../constants';
import type { AnalysisMode, Search } from '../../../types';

interface Props {
  search: Search;
  open: boolean;
  onClose: () => void;
  initialMode?: AnalysisMode;
  /** Відкрито поверх іншої модалки (майстра) — modal=false, див. ConfirmActionDialog. */
  nested?: boolean;
}

const MODE_PALETTE: Record<AnalysisMode, string> = { cons: 'danger', pros: 'success' };

/** Відкритий підділог: об'єднання/перейменування або видалення з обраними формулюваннями. */
type SubDialog = { kind: 'merge' | 'rename' | 'delete'; names: string[] } | null;

/**
 * Вікно «Критерії пошуку» (docs/plans/criteria-categories.md): перегляд усіх мінусів/плюсів пошуку,
 * додавання й генерація, позначка «в аналізі», перейменування, видалення та об'єднання синонімічних
 * формулювань у категорію — без майстра AI-аналізу. Входи: меню пошуку, хаб AI, крок 1 майстра.
 */
export function CriteriaManagerDialog({ search, open, onClose, initialMode = 'cons', nested = false }: Props) {
  const isMobile = useIsMobile();
  const m = useCriteriaManager(search.id, open, initialMode);
  const { data: status } = useAnalysisStatus();
  const apiAvailable = status?.apiAvailable ?? false;
  const [customInput, setCustomInput] = useState('');
  const [sub, setSub] = useState<SubDialog>(null);

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

  return (
    <DialogRoot
      open={open}
      onOpenChange={(d) => !d.open && onClose()}
      size={isMobile ? 'full' : 'lg'}
      placement="center"
      scrollBehavior="inside"
      modal={!nested}
    >
      <DialogBackdrop />
      <DialogContent>
        <DialogCloseTrigger />
        <DialogHeader>
          <Stack gap={3} w="full">
            <DialogTitle>Критерії пошуку — {search.name}</DialogTitle>
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
                <>
                  <Button
                    size="sm"
                    colorPalette="purple"
                    onClick={m.generation.handleGenerate}
                    loading={m.generation.generatePending}
                  >
                    <LuWandSparkles /> Згенерувати
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={m.generation.handleGenerate}
                    loading={m.generation.generatePending}
                  >
                    <LuRefreshCw /> Ще варіанти
                  </Button>
                </>
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
                {m.rows.listed.length === 0 && m.rows.orphans.length === 0 && (
                  <Text textStyle="sm" color="fg.muted" py={3}>
                    {m.filter ? 'Нічого не знайдено.' : 'Критеріїв ще немає — згенеруй або додай вручну.'}
                  </Text>
                )}
                {m.rows.listed.map((row) => (
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
                ))}
                {m.rows.orphans.length > 0 && (
                  <>
                    <Text textStyle="xs" color="fg.muted" pt={3} pb={1}>
                      Лише в оголошеннях (не в списку критеріїв): старі прогони або ручні правки
                    </Text>
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

      <MergeCriteriaDialog
        open={sub?.kind === 'merge' || sub?.kind === 'rename'}
        onClose={() => setSub(null)}
        title={sub?.kind === 'rename' ? 'Перейменувати категорію' : "Об'єднати в категорію"}
        names={sub?.names ?? EMPTY}
        aliases={subAliases}
        affected={sub ? m.affectedCount(sub.names) : 0}
        pending={m.remapPending}
        onConfirm={(name) => void confirmRemap(name)}
      />
      <DeleteCriteriaDialog
        open={sub?.kind === 'delete'}
        onClose={() => setSub(null)}
        names={sub?.names ?? EMPTY}
        affected={sub ? m.affectedCount(sub.names) : 0}
        pending={m.remapPending}
        onConfirm={(withListings) => void confirmRemap(null, withListings)}
      />
    </DialogRoot>
  );
}

const EMPTY: string[] = [];
