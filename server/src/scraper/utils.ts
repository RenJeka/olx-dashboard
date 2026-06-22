/**
 * Спільні утиліти для скраперів OLX (GraphQL, HTML) та scanner.
 * Раніше ці функції дублювались у graphqlOlxFetcher.ts, olxFetcher.ts, scanner.ts.
 */

/** Promise-обгортка над setTimeout — пауза між запитами/батчами. */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Пауза, яку можна перервати достроково через `shouldAbort` (кнопка «Зупинити»).
 * Замість одного довгого setTimeout опитує прапорець кожні ~250 мс — без неї тривалі
 * паузи між батчами/бакетами/варіантами (3–6 с) затримували реакцію на abort на кілька
 * секунд, через що зупинка скану виглядала «не спрацьовує». Без `shouldAbort` = звичайний sleep.
 */
export async function interruptibleSleep(ms: number, shouldAbort?: () => boolean): Promise<void> {
  if (!shouldAbort) return sleep(ms);
  const step = 250;
  let elapsed = 0;
  while (elapsed < ms) {
    if (shouldAbort()) return;
    await sleep(Math.min(step, ms - elapsed));
    elapsed += step;
  }
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
