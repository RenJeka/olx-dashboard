import {
  DEEP_SCAN_MAX_PAGES,
  DEEP_SCAN_PAGE_LIMIT,
  DEEP_SCAN_SECONDS_PER_REQUEST,
  DEEP_SCAN_SPLIT_THRESHOLD,
} from '../constants';
import type { ScanResult } from '../types';

/**
 * Зупинка користувачем (кнопка «Зупинити») приходить як кинута помилка з текстом
 * «…зупинено користувачем». Це НЕ збій — показуємо нейтральний info-тост, а не error.
 */
export function isUserAbort(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return /зупинено користувачем/i.test(msg);
}

/**
 * Опис результату скану для toast: дедуп між синонімами (сирих/злито дублів,
 * docs/plans/old/deep-scan-stop-and-history.md) + позначка зупинки користувачем.
 */
export function describeScanResult(r: ScanResult, deep: boolean): { title: string; description: string } {
  const bucketsSuffix = r.bucketsUsed != null && r.bucketsUsed > 1 ? ` · діапазонів ${r.bucketsUsed}` : '';
  const dedupSuffix =
    r.rawFound != null && r.rawFound > r.found
      ? ` · сирих ${r.rawFound} · злито дублів ${r.rawFound - r.found}`
      : '';
  const description = deep
    ? `${r.requestsUsed} запитів · унікальних ${r.found} · нових ${r.new_count} · вимкнено ${r.disabled_count}${bucketsSuffix}${dedupSuffix}`
    : `Унікальних ${r.found} · нових ${r.new_count} · вимкнено ${r.disabled_count}${dedupSuffix}`;
  const title = r.stopped
    ? 'Скан зупинено — збережено зібране'
    : deep
      ? 'Глибокий скан завершено'
      : 'Скан завершено';
  return { title, description };
}

/** Оцінка глибокого скану для підтвердження: чи буде розбиття по ціні, скільки діапазонів, запитів і хвилин. */
export function estimateDeepScan(visibleTotal: number | null | undefined) {
  const willSplit = visibleTotal != null && visibleTotal > DEEP_SCAN_SPLIT_THRESHOLD;
  const deepScanBuckets = willSplit ? Math.ceil(visibleTotal! / DEEP_SCAN_SPLIT_THRESHOLD) : 1;
  const deepScanRequests =
    visibleTotal != null
      ? willSplit
        ? Math.ceil(visibleTotal / DEEP_SCAN_PAGE_LIMIT)
        : Math.min(DEEP_SCAN_MAX_PAGES, Math.ceil(visibleTotal / DEEP_SCAN_PAGE_LIMIT))
      : DEEP_SCAN_MAX_PAGES;
  const deepScanMinutes = Math.max(1, Math.round((deepScanRequests * DEEP_SCAN_SECONDS_PER_REQUEST) / 60));
  return { willSplit, deepScanBuckets, deepScanRequests, deepScanMinutes };
}
