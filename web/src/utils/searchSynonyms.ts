/** Парсить JSON-масив синонімів запиту (`searches.query_synonyms`). */
export function parseSearchSynonyms(raw: string): string[] {
  try {
    const parsed = JSON.parse(raw || '[]');
    return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === 'string') : [];
  } catch {
    return [];
  }
}
