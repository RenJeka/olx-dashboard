// Текстові хелпери LLM-аналізу: очистка HTML-опису та нормалізація для верифікації evidence.
import { EVIDENCE_MIN_LENGTH } from './constants.js';

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
  if (needle.length < EVIDENCE_MIN_LENGTH) return false;
  return normalizeForMatch(description).includes(needle);
}

/** TEXT-поле pros/cons (`• item\n• item`, сумісне з ручним едітом) → масив пунктів. */
export function parseBullets(text: string | null): string[] {
  if (!text) return [];
  return text
    .split('\n')
    .map((line) => line.replace(/^•\s*/, '').trim())
    .filter(Boolean);
}

/**
 * Короткий фрагмент опису для колонки таблиці (`/listings` не віддає повний опис —
 * docs/plans/old/listings-light-payload.md). `html` — уже обрізаний SQL-ем початок опису: прибираємо
 * обірваний на межі тег і обрізаємо чистий текст до `maxChars` (з «…», якщо щось відкинуто).
 */
export function descriptionPreview(html: string | null | undefined, maxChars: number): string | null {
  if (!html) return null;
  const text = stripHtml(html.replace(/<[^>]*$/, ''));
  if (!text) return null;
  return text.length > maxChars ? `${text.slice(0, maxChars).trimEnd()}…` : text;
}

/**
 * Булевий пошук по тексту (вже у нижньому регістрі): `||` — АБО, `&&` — І, `!терм` — НЕ.
 * Дзеркалить web/src/utils/search.ts (matchesQuery) — пошук в описі тепер на сервері.
 */
export function matchesQuery(haystack: string, rawQuery: string): boolean {
  const query = rawQuery.trim().toLowerCase();
  if (!query) return true;
  return query.split('||').some((group) => {
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
