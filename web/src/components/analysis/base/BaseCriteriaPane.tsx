import { useState, type RefObject } from 'react';
import { Button, HStack, Input, Spinner, Stack, Text } from '@chakra-ui/react';
import { LuCombine, LuSearch, LuTrash2 } from 'react-icons/lu';
import { toaster } from '../../ui/toaster';
import { ModeToggle } from '../ModeToggle';
import { CriteriaInputBar } from '../criteria/CriteriaInputBar';
import { CriteriaList } from '../criteria/CriteriaList';
import { MergeCriteriaDialog } from '../criteria/MergeCriteriaDialog';
import { DeleteCriteriaDialog } from '../criteria/DeleteCriteriaDialog';
import { InheritedCriteriaList } from './InheritedCriteriaList';
import { useAnalysisStatus } from '../../../api';
import { useBaseCriteriaManager } from '../../../hooks/analysis/useBaseCriteriaManager';
import { MODE_PALETTE } from '../../../constants';
import type { AnalysisMode } from '../../../types';

interface Props {
  categoryId: number;
  initialMode: AnalysisMode;
  onModeChange: (mode: AnalysisMode) => void;
  /** Контент вікна — для діалогів поверх нього (поля вводу; docs/instructions/chakra-nested-dialog-focus.md). */
  portalRef: RefObject<HTMLElement | null>;
}

/** Відкритий підділог: об'єднання/перейменування або видалення з обраними пунктами. */
type SubDialog = { kind: 'merge' | 'rename' | 'delete'; names: string[] } | null;

/**
 * Права панель вікна «Базові плюси й мінуси»: власний набір обраної категорії (ті самі дії, що у вікні
 * «Плюси та мінуси» пошуку) і нижче — успадковані від предків. Монтувати з `key={categoryId}`: вибір, фільтр
 * і згенероване належать одній категорії.
 */
export function BaseCriteriaPane({ categoryId, initialMode, onModeChange, portalRef }: Props) {
  const m = useBaseCriteriaManager(categoryId, initialMode);
  const { data: status } = useAnalysisStatus();
  const [customInput, setCustomInput] = useState('');
  const [sub, setSub] = useState<SubDialog>(null);

  const busy = m.savePending || m.remapPending;
  const selectedNames = m.selectedNames;
  const subAliases = (sub?.names ?? []).flatMap((n) => m.groups.find((g) => g.name === n)?.aliases ?? []);

  async function addCustom() {
    const c = customInput.trim();
    if (!c) return;
    try {
      const added = await m.addPhrases([c]);
      if (added === 0) toaster.create({ type: 'info', title: 'Такий пункт уже є (власний чи успадкований)' });
      setCustomInput('');
    } catch {
      // тост — у хуку
    }
  }

  async function confirmRemap(to: string | null) {
    if (!sub) return;
    if (await m.runRemap(sub.names, to)) setSub(null);
  }

  return (
    <Stack gap={3}>
      <HStack gap={2} wrap="wrap">
        <ModeToggle
          mode={m.mode}
          onChange={(next) => {
            m.setMode(next);
            onModeChange(next);
          }}
        />
        <HStack flex="1" minW="160px" gap={1}>
          <LuSearch />
          <Input size="xs" placeholder="фільтр" value={m.filter} onChange={(e) => m.setFilter(e.target.value)} />
        </HStack>
      </HStack>

      <CriteriaInputBar
        value={customInput}
        onChange={setCustomInput}
        onAdd={() => void addCustom()}
        addDisabled={busy}
        apiAvailable={status?.apiAvailable ?? false}
        generation={m.generation}
        portalRef={portalRef}
      />

      {m.isLoading ? (
        <Spinner size="sm" />
      ) : (
        <>
          <CriteriaList
            m={m}
            colorPalette={MODE_PALETTE[m.mode]}
            busy={busy}
            onRename={(name) => setSub({ kind: 'rename', names: [name] })}
            onDelete={(name) => setSub({ kind: 'delete', names: [name] })}
          />
          {m.groups.length > 0 && (
            <HStack justify="space-between" gap={2} wrap="wrap">
              <Text textStyle="sm" color="fg.muted">
                Обрано {selectedNames.length}
              </Text>
              <HStack gap={2}>
                <Button
                  size="sm"
                  colorPalette="accent"
                  disabled={selectedNames.length === 0 || busy}
                  onClick={() =>
                    setSub({ kind: selectedNames.length === 1 ? 'rename' : 'merge', names: selectedNames })
                  }
                >
                  <LuCombine /> Об'єднати…
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
            </HStack>
          )}
          <InheritedCriteriaList groups={m.inherited} filtered={m.filter.trim().length > 0} />
        </>
      )}

      {(sub?.kind === 'merge' || sub?.kind === 'rename') && (
        <MergeCriteriaDialog
          portalRef={portalRef}
          onClose={() => setSub(null)}
          title={sub.kind === 'rename' ? 'Перейменувати пункт' : "Об'єднати пункти"}
          nameLabel="Назва пункту"
          names={sub.names}
          aliases={subAliases}
          affected={m.affectedCount(sub.names)}
          pending={m.remapPending}
          onConfirm={(name) => void confirmRemap(name)}
        />
      )}
      {sub?.kind === 'delete' && (
        <DeleteCriteriaDialog
          portalRef={portalRef}
          onClose={() => setSub(null)}
          names={sub.names}
          affected={m.affectedCount(sub.names)}
          pending={m.remapPending}
          onConfirm={() => void confirmRemap(null)}
        />
      )}
    </Stack>
  );
}
