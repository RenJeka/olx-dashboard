/**
 * Локальний пошук у таблиці зі спецсимволами (як у фільтрах коду):
 *   `||` — АБО (хоча б одна з груп),
 *   `&&` — ТА (всі терми в групі),
 *   `!`  — НЕ (терм НЕ міститься; префікс перед термом).
 *
 * Граматика: запит → групи через `||`; група → терми через `&&`; терм → опц. `!` + текст.
 * Збіг = АБО(групи), де група = ТА(термів). Без спецсимволів — звичайний підрядковий пошук.
 */

/** Чи відповідає `haystack` (вже у нижньому регістрі) булевому запиту. */
export function matchesQuery(haystack: string, rawQuery: string): boolean {
  const query = rawQuery.trim().toLowerCase();
  if (!query) return true;

  const orGroups = query.split('||');
  return orGroups.some((group) => {
    const andTerms = group
      .split('&&')
      .map((t) => t.trim())
      .filter(Boolean);
    if (andTerms.length === 0) return false;
    return andTerms.every((term) => {
      if (term.startsWith('!')) {
        const negated = term.slice(1).trim();
        return negated ? !haystack.includes(negated) : true;
      }
      return haystack.includes(term);
    });
  });
}

/** Чи містить запит спецсимволи булевого пошуку (`&&`, `||`, `!`). */
export function hasSearchOperators(rawQuery: string): boolean {
  return /\|\||&&|!/.test(rawQuery);
}

/**
 * Витягує позитивні (не-`!`) терми для підсвічування у тексті. Негативні терми
 * не підсвічуються (їх у тексті немає за визначенням).
 */
export function extractSearchTerms(rawQuery: string): string[] {
  const query = rawQuery.trim();
  if (!query) return [];
  return query
    .split(/\|\||&&/)
    .map((t) => t.trim())
    .filter((t) => t && !t.startsWith('!'));
}

/**
 * Запит для <HighlightText>: якщо є спецсимволи — масив позитивних термів,
 * інакше — сам рядок (щоб працювала підсвітка коротких 1–2-символьних запитів).
 */
export function toHighlightQuery(rawQuery: string): string | string[] {
  return hasSearchOperators(rawQuery) ? extractSearchTerms(rawQuery) : rawQuery;
}
