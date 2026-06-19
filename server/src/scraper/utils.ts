/**
 * Спільні утиліти для скраперів OLX (GraphQL, HTML) та scanner.
 * Раніше ці функції дублювались у graphqlOlxFetcher.ts, olxFetcher.ts, scanner.ts.
 */

/** Promise-обгортка над setTimeout — пауза між запитами/батчами. */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Рандомна затримка (мс) у заданому діапазоні [min, max). */
export function randomDelayMs(min: number, max: number): number {
  return min + Math.floor(Math.random() * (max - min));
}

/**
 * Слаг для сегмента `q-<...>` у URL/Referer пошуку OLX.
 * Формат: trim → lowercase → пробіли → дефіси → URI-encode.
 */
export function slugify(query: string): string {
  const slug = query.trim().toLowerCase().replace(/\s+/g, '-');
  return encodeURIComponent(slug);
}
