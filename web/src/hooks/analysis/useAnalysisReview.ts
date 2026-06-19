import { useState, useMemo } from 'react';
import { useAnalysisWizardStore } from '../../stores/analysisWizardStore';
import { exportPreview } from '../../api';
import { criterionKey, isIncludedFn } from '../../utils/analysis';
import { showErrorToast } from '../../utils/toast';
import type { Listing, MatchedItem } from '../../types';

/**
 * Логіка кроку 3 (Перевірка): перегляд результатів AI-аналізу.
 * Надає можливість ручного включення/виключення знайдених збігів (overrides)
 * перед записом у базу, а також функцію експорту результатів у Excel/JSON.
 */
export function useAnalysisReview(searchId: number, listingById: Map<number, Listing>) {
  const { mode, accumulated, includedOverrides, setIncludedOverrides } = useAnalysisWizardStore();

  const [openDescriptionListing, setOpenDescriptionListing] = useState<Listing | null>(null);

  function isIncluded(id: number, item: MatchedItem): boolean {
    return isIncludedFn(includedOverrides, id, item);
  }

  function toggleIncluded(id: number, item: MatchedItem) {
    const key = criterionKey(id, item.criterion);
    setIncludedOverrides((prev) => {
      const next = new Map(prev);
      next.set(key, !isIncluded(id, item));
      return next;
    });
  }

  const visibleRows = useMemo(() => accumulated.filter((r) => r.items.length > 0), [accumulated]);
  const hiddenCount = accumulated.length - visibleRows.length;

  const commitItems = useMemo(
    () =>
      accumulated.map((r) => ({
        id: r.id,
        criteria: r.items.filter((it) => isIncluded(r.id, it)).map((it) => it.criterion),
      })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [accumulated, includedOverrides],
  );

  const overwriteCount = useMemo(() => {
    let n = 0;
    for (const item of commitItems) {
      const l = listingById.get(item.id);
      if (l && (mode === 'cons' ? l.cons : l.pros)) n++;
    }
    return n;
  }, [commitItems, listingById, mode]);

  async function handleExport(format: 'xlsx' | 'json') {
    const rows = accumulated.map((r) => ({
      id: r.id,
      criteria: r.items.filter((it) => isIncluded(r.id, it)).map((it) => it.criterion),
    }));
    try {
      await exportPreview(searchId, mode, format, rows);
    } catch (err) {
      showErrorToast('Помилка експорту', err);
    }
  }

  return {
    openDescriptionListing, setOpenDescriptionListing,
    isIncluded, toggleIncluded,
    visibleRows, hiddenCount,
    commitItems, overwriteCount,
    handleExport,
  };
}
