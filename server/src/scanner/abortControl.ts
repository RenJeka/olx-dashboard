// ── Зупинка скану (docs/plans/deep-scan-stop-and-history.md) ──────────────────
// Single-user локальний застосунок: один активний скан на пошук. Прапорець ставить
// requestStopScan (роут POST /scan/stop), фетчери опитують його через FetchOptions.shouldAbort.
// При зупинці зібране все одно зберігається (upsert), вікно покриття пропускається.
export const abortFlags = new Map<number, boolean>();

/** Запит на зупинку активного скану пошуку. Повертає true, якщо скан справді виконувався. */
export function requestStopScan(searchId: number): boolean {
  if (!abortFlags.has(searchId)) return false;
  abortFlags.set(searchId, true);
  return true;
}
