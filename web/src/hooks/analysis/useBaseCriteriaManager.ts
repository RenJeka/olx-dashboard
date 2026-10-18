import { useMemo, useState } from 'react';
import {
  useCategoryCriteria,
  useGenerateCategoryCriteria,
  useRemapCategoryCriteria,
  useSaveCategoryCriteria,
} from '../../api';
import { useSettingsStore } from '../../stores/settingsStore';
import { toaster } from '../../components/ui/toaster';
import { showErrorToast } from '../../utils/toast';
import { absorbIncoming, categoriesFirst, phraseKey } from '../../utils/criteria';
import { useCriteriaCandidates, type CriteriaGenerationModel } from './useCriteriaGeneration';
import type { CriteriaListModel, CriteriaRows, CriterionRowData } from './useCriteriaManager';
import type { AnalysisMode, CriterionGroup } from '../../types';

const NO_GROUPS: CriterionGroup[] = [];

/** Чи збігається пункт (назва чи синонім) із фільтром вікна. */
function matchesFilter(g: CriterionGroup, q: string): boolean {
  return !q || [g.name, ...g.aliases].some((s) => phraseKey(s).includes(q));
}

/**
 * Вікно «Базові плюси й мінуси» (docs/plans/base-criteria.md), права панель: власний набір категорії OLX
 * (додати, перейменувати, синоніми, об'єднати, видалити, вимкнути) + успадковані від предків (лише перегляд).
 * Інтерфейс — як у `useCriteriaManager`, щоб перевикористати `CriteriaList`, `CriteriaInputBar` і діалоги
 * об'єднання/видалення. Оголошень тут немає: лічильників і пунктів «лише в оголошеннях» нема.
 * Зміни списку зберігаються одразу (PUT), об'єднання/перейменування/видалення — через remap категорії.
 */
export function useBaseCriteriaManager(categoryId: number, initialMode: AnalysisMode) {
  const [mode, setModeState] = useState<AnalysisMode>(initialMode);
  const [filter, setFilter] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const { data, isLoading } = useCategoryCriteria(categoryId);
  const save = useSaveCategoryCriteria();
  const remap = useRemapCategoryCriteria();
  const generate = useGenerateCategoryCriteria();

  /** Власні пункти режиму (те, що редагується). */
  const groups = data?.own[mode] ?? NO_GROUPS;
  /** Успадковані від предків (з `base` — звідки), лише перегляд. */
  const inheritedAll = data?.inherited[mode] ?? NO_GROUPS;
  const selectedNames = useMemo(
    () => [...selected].filter((n) => groups.some((g) => g.name === n)),
    [selected, groups],
  );

  const rows = useMemo((): CriteriaRows => {
    const byName = new Map(groups.map((g) => [g.name, g]));
    const toRow = (name: string): CriterionRowData => ({ name, group: byName.get(name) ?? null, count: null });
    const [categoryNames, singleNames] = categoriesFirst(
      groups.map((g) => g.name),
      (name) => (byName.get(name)?.aliases.length ?? 0) > 0,
    );
    const q = phraseKey(filter);
    const keep = (r: CriterionRowData) => r.group !== null && matchesFilter(r.group, q);
    return { categories: categoryNames.map(toRow).filter(keep), singles: singleNames.map(toRow).filter(keep), orphans: [] };
  }, [groups, filter]);

  const inherited = useMemo(() => {
    const q = phraseKey(filter);
    const byName = new Map(inheritedAll.map((g) => [g.name, g]));
    const [categoryNames, singleNames] = categoriesFirst(
      inheritedAll.map((g) => g.name),
      (name) => (byName.get(name)?.aliases.length ?? 0) > 0,
    );
    return [...categoryNames, ...singleNames]
      .map((name) => byName.get(name))
      .filter((g): g is CriterionGroup => g !== undefined && matchesFilter(g, q));
  }, [inheritedAll, filter]);

  function setMode(next: AnalysisMode) {
    setModeState(next);
    setSelected(new Set());
    setFilter('');
  }

  function toggleSelected(name: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  }

  async function saveGroups(next: CriterionGroup[]) {
    try {
      await save.mutateAsync(mode === 'cons' ? { categoryId, cons: next } : { categoryId, pros: next });
    } catch (err) {
      showErrorToast('Не вдалося зберегти набір категорії', err);
      throw err;
    }
  }

  /** Нові формулювання — без збігів із власними й успадкованими (назва чи синонім). */
  function freshOf(phrases: string[]): string[] {
    return absorbIncoming([...inheritedAll, ...groups], phrases).added;
  }

  /** Додати формулювання як нові пункти набору. Повертає к-сть нових. */
  async function addPhrases(phrases: string[]): Promise<number> {
    const added = freshOf(phrases);
    if (added.length > 0) await saveGroups([...groups, ...added.map((name) => ({ name, aliases: [], enabled: true }))]);
    return added.length;
  }

  const { offer, ...pick } = useCriteriaCandidates({ freshOf, onAdd: addPhrases });

  /** «Згенерувати»: чернетка від LLM (платно — лише за кнопкою) → вікно «Згенеровано: нових N». */
  async function handleGenerate() {
    const { analysisModel: model, analysisReasoning: reasoning } = useSettingsStore.getState();
    try {
      const { criteria } = await generate.mutateAsync({ categoryId, mode, model, reasoning });
      offer('Згенеровано', criteria);
    } catch (err) {
      showErrorToast('Помилка генерації', err);
    }
  }

  const generation: CriteriaGenerationModel = {
    handleGenerate,
    generatePending: generate.isPending,
    ...pick,
  };

  function toggleEnabled(name: string) {
    void saveGroups(groups.map((g) => (g.name === name ? { ...g, enabled: !g.enabled } : g))).catch(() => {});
  }

  /** Вийняти синонім з пункту — стає окремим пунктом з тією ж позначкою «в аналізі». */
  function detachAlias(name: string, alias: string) {
    const next = groups.flatMap((g) =>
      g.name === name
        ? [{ ...g, aliases: g.aliases.filter((a) => a !== alias) }, { name: alias, aliases: [], enabled: g.enabled }]
        : [g],
    );
    void saveGroups(next).catch(() => {});
  }

  /** Перейменування/об'єднання (`to`) чи видалення (`to = null`; оголошень не чіпає). */
  async function runRemap(from: string[], to: string | null): Promise<boolean> {
    try {
      const res = await remap.mutateAsync({ categoryId, mode, from, to });
      setSelected(new Set());
      toaster.create({
        type: 'success',
        title: to === null ? 'Видалено' : `Пункт «${to.trim()}» збережено`,
        description: res.updated > 0 ? `Змінено оголошень: ${res.updated} (пошуків: ${res.searches})` : undefined,
      });
      return true;
    } catch (err) {
      showErrorToast('Не вдалося змінити набір категорії', err);
      return false;
    }
  }

  const list: CriteriaListModel = { rows, filter, selected, toggleSelected, toggleEnabled, detachAlias, addPhrases };

  return {
    ...list,
    mode, setMode,
    setFilter,
    selectedNames,
    isLoading,
    groups,
    inherited,
    /** Скільки оголошень зачепить — наперед невідомо (пошуки піддерева рахує сервер). */
    affectedCount: (_names: string[]): number | null => null,
    runRemap,
    savePending: save.isPending,
    remapPending: remap.isPending,
    generation,
  };
}
