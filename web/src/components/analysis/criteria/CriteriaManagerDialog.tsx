import { useRef, useState, type RefObject } from 'react';
import { Button, HStack, Input, Spinner, Stack, Text } from '@chakra-ui/react';
import { LuCombine, LuSearch, LuTrash2 } from 'react-icons/lu';
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
import { ModeToggle } from '../ModeToggle';
import { CriteriaInputBar } from './CriteriaInputBar';
import { CriteriaList } from './CriteriaList';
import { MergeCriteriaDialog } from './MergeCriteriaDialog';
import { DeleteCriteriaDialog } from './DeleteCriteriaDialog';
import { useAnalysisStatus } from '../../../api';
import { useCriteriaManager } from '../../../hooks/analysis/useCriteriaManager';
import { useIsMobile } from '../../../hooks/useIsMobile';
import { MODE_PALETTE } from '../../../constants';
import type { AnalysisMode, Search } from '../../../types';

interface Props {
  search: Search;
  onClose: () => void;
  initialMode?: AnalysisMode;
  /**
   * Відкрито поверх іншої модалки (майстра): її контент. Вікно рендериться всередині її DOM і з modal=false —
   * інакше фокус-пастка нижньої модалки не пускає фокус у поля вікна.
   */
  portalRef?: RefObject<HTMLElement | null>;
}

/** Відкритий підділог: об'єднання/перейменування або видалення з обраними формулюваннями. */
type SubDialog = { kind: 'merge' | 'rename' | 'delete'; names: string[] } | null;

/**
 * Вікно «Плюси та мінуси» (docs/plans/criteria-categories.md): перегляд усіх мінусів/плюсів пошуку,
 * додавання й генерація, позначка «в аналізі», перейменування, видалення та об'єднання синонімічних
 * формулювань у категорію — без майстра AI-аналізу. Входи: меню пошуку, хаб AI, крок 1 майстра.
 * Монтувати лише на час показу (`{open && <CriteriaManagerDialog … />}`): запити критеріїв і оголошень,
 * режим і portalRef беруться при монтуванні.
 */
export function CriteriaManagerDialog({ search, onClose, initialMode = 'cons', portalRef }: Props) {
  const isMobile = useIsMobile();
  const m = useCriteriaManager(search.id, initialMode);
  const { data: status } = useAnalysisStatus();
  const [customInput, setCustomInput] = useState('');
  const [sub, setSub] = useState<SubDialog>(null);
  const contentRef = useRef<HTMLDivElement>(null);

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
      open
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
              <ModeToggle mode={m.mode} onChange={m.setMode} />
              <HStack flex="1" minW="160px" gap={1}>
                <LuSearch />
                <Input size="xs" placeholder="фільтр" value={m.filter} onChange={(e) => m.setFilter(e.target.value)} />
              </HStack>
            </HStack>
          </Stack>
        </DialogHeader>

        <DialogBody pb={4}>
          <Stack gap={3}>
            <CriteriaInputBar
              value={customInput}
              onChange={setCustomInput}
              onAdd={() => void addCustom()}
              addDisabled={busy}
              apiAvailable={status?.apiAvailable ?? false}
              generation={m.generation}
              portalRef={contentRef}
            />
            {m.isLoading ? (
              <Spinner size="sm" />
            ) : (
              <CriteriaList
                m={m}
                colorPalette={MODE_PALETTE[m.mode]}
                busy={busy}
                onRename={(name) => setSub({ kind: 'rename', names: [name] })}
                onDelete={(name) => setSub({ kind: 'delete', names: [name] })}
              />
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

      {(sub?.kind === 'merge' || sub?.kind === 'rename') && (
        <MergeCriteriaDialog
          portalRef={contentRef}
          onClose={() => setSub(null)}
          title={sub.kind === 'rename' ? 'Перейменувати категорію' : "Об'єднати в категорію"}
          names={sub.names}
          aliases={subAliases}
          affected={m.affectedCount(sub.names)}
          pending={m.remapPending}
          onConfirm={(name) => void confirmRemap(name)}
        />
      )}
      {sub?.kind === 'delete' && (
        <DeleteCriteriaDialog
          portalRef={contentRef}
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
