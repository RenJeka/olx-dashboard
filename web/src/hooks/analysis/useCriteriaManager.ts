import { useMemo, useState } from 'react';
import { useListings, useRemapCriteria, useSaveCriteria, useSavedCriteria } from '../../api';
import { toaster } from '../../components/ui/toaster';
import { showErrorToast } from '../../utils/toast';
import { sortAlpha } from '../../utils/sort';
import { parseBullets } from '../../utils/localFilters';
import { absorbIncoming, groupKeys, orphanPhrases, phraseKey } from '../../utils/criteria';
import { useCriteriaGeneration } from './useCriteriaGeneration';
import type { AnalysisMode, CriterionGroup } from '../../types';

/** Рядок вікна: категорія зі списку пошуку або пункт, що є лише в оголошеннях. */
export interface CriterionRowData {
  name: string;
  group: CriterionGroup | null;
  /** Скільки оголошень містить назву чи будь-який синонім. */
  count: number;
}

/**
 * Вікно «Плюси та мінуси» (docs/plans/criteria-categories.md): категорії режиму, лічильники з уже
 * завантажених оголошень (без запитів у Turso), вибір для об'єднання/видалення, генерація й додавання.
 * Зміни списку зберігаються одразу (PUT), об'єднання/перейменування/видалення — через remap.
 */
export function useCriteriaManager(searchId: number, open: boolean, initialMode: AnalysisMode) {
  const [mode, setModeState] = useState<AnalysisMode>(initialMode);
  const [filter, setFilter] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const { data: config, isLoading } = useSavedCriteria(open ? searchId : null);
  const { data: listings } = useListings(open ? searchId : null);
  const save = useSaveCriteria();
  const remap = useRemapCriteria();

  const groups = useMemo(() => config?.[mode] ?? [], [config, mode]);

  // Ключі пунктів кожного оголошення — один раз на режим; далі лічильники категорій і «зачепить N».
  const listingKeys = useMemo(
    () => (listings ?? []).map((l) => new Set(parseBullets(l[mode]).map(phraseKey))),
    [listings, mode],
  );
  const countWithAny = (keys: Iterable<string>) => {
    const set = new Set(keys);
    return listingKeys.filter((lk) => [...lk].some((k) => set.has(k))).length;
  };

  const rows = useMemo(() => {
    const countFor = (keys: string[]) => {
      const set = new Set(keys);
      return listingKeys.filter((lk) => [...lk].some((k) => set.has(k))).length;
    };
    const byName = new Map(groups.map((g) => [g.name, g]));
    const toRow = (name: string): CriterionRowData => {
      const group = byName.get(name) as CriterionGroup;
      return { name, group, count: countFor(groupKeys(group)) };
    };
    // Спершу категорії (є синоніми), далі окремі критерії — кожна частина за алфавітом.
    const categories = sortAlpha(groups.filter((g) => g.aliases.length > 0).map((g) => g.name)).map(toRow);
    const singles = sortAlpha(groups.filter((g) => g.aliases.length === 0).map((g) => g.name)).map(toRow);
    const orphans: CriterionRowData[] = sortAlpha(orphanPhrases(listings ?? [], mode, groups)).map((name) => ({
      name,
      group: null,
      count: countFor([phraseKey(name)]),
    }));
    const q = phraseKey(filter);
    const matches = (r: CriterionRowData) =>
      !q || [r.name, ...(r.group?.aliases ?? [])].some((s) => phraseKey(s).includes(q));
    return {
      categories: categories.filter(matches),
      singles: singles.filter(matches),
      orphans: orphans.filter(matches),
    };
  }, [groups, listings, listingKeys, mode, filter]);

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
      await save.mutateAsync(mode === 'cons' ? { searchId, cons: next } : { searchId, pros: next });
    } catch (err) {
      showErrorToast('Не вдалося зберегти критерії', err);
      throw err;
    }
  }

  /** Додати формулювання як нові категорії (наявні назви/синоніми поглинаються). Повертає к-сть нових. */
  async function addPhrases(phrases: string[]): Promise<number> {
    const { groups: next, added } = absorbIncoming(groups, phrases);
    if (added.length > 0) await saveGroups(next);
    return added.length;
  }

  const generation = useCriteriaGeneration(searchId, mode, {
    freshOf: (criteria) => absorbIncoming(groups, criteria).added,
    onAdd: addPhrases,
  });

  function toggleEnabled(name: string) {
    void saveGroups(groups.map((g) => (g.name === name ? { ...g, enabled: !g.enabled } : g))).catch(() => {});
  }

  /** Вийняти синонім з категорії — стає окремою категорією з тією ж позначкою «в аналізі». */
  function detachAlias(name: string, alias: string) {
    const next = groups.flatMap((g) =>
      g.name === name
        ? [{ ...g, aliases: g.aliases.filter((a) => a !== alias) }, { name: alias, aliases: [], enabled: g.enabled }]
        : [g],
    );
    void saveGroups(next).catch(() => {});
  }

  /** Ключі формулювань обраних рядків (назви + синоніми категорій, пункти «лише в оголошеннях»). */
  function keysOf(names: string[]): string[] {
    return names.flatMap((n) => {
      const g = groups.find((x) => x.name === n);
      return g ? groupKeys(g) : [phraseKey(n)];
    });
  }

  async function runRemap(from: string[], to: string | null, withListings = true): Promise<boolean> {
    try {
      const res = await remap.mutateAsync({ searchId, mode, from, to, listings: withListings });
      setSelected(new Set());
      toaster.create({
        type: 'success',
        title: to === null ? 'Видалено' : `Категорія «${to.trim()}» збережена`,
        description: `Змінено оголошень: ${res.updated}`,
      });
      return true;
    } catch (err) {
      showErrorToast('Не вдалося змінити критерії', err);
      return false;
    }
  }

  return {
    mode, setMode,
    filter, setFilter,
    selected, toggleSelected, clearSelected: () => setSelected(new Set()),
    isLoading,
    groups,
    rows,
    affectedCount: (names: string[]) => countWithAny(keysOf(names)),
    addPhrases,
    toggleEnabled,
    detachAlias,
    runRemap,
    savePending: save.isPending,
    remapPending: remap.isPending,
    generation,
  };
}
