// Текстові хелпери LLM-аналізу: очистка HTML-опису та нормалізація для верифікації evidence.

/**
 * HTML-опис OLX (з <br /> тегами) → plain text. Дзеркалить web/src/utils/format.ts
 * (stripDescriptionHtml) — LLM працює з чистим текстом, evidence звіряється з ним.
 */
export function stripHtml(html: string | null | undefined): string {
  if (!html) return '';
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .trim();
}

/** Нормалізація для substring-перевірки: lowercase + згортання пробілів. */
export function normalizeForMatch(value: string): string {
  return value.toLowerCase().replace(/\s+/g, ' ').trim();
}

/**
 * Анти-галюцинація: чи evidence є підрядком опису (після нормалізації).
 * Порожній evidence → не підтверджено (LLM має навести фрагмент).
 */
export function evidenceConfirmed(evidence: string, description: string): boolean {
  const needle = normalizeForMatch(evidence);
  if (needle.length < 3) return false;
  return normalizeForMatch(description).includes(needle);
}

/** Груба оцінка токенів (≈4 символи/токен) — для авто-вибору розміру ручного пакета. */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}
