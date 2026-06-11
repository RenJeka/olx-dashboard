import type { Listing } from '../types';

/**
 * Форматує ціну оголошення у локалізований вигляд з валютою.
 */
export function formatPrice(l: Listing): string {
  if (l.price == null) return '—';
  return `${l.price.toLocaleString('uk-UA')} ${l.currency}`;
}

const KY_LOCALE = 'uk-UA';
const KY_TZ = 'Europe/Kyiv';

/**
 * Форматує ISO дату у читабельну коротку дату (київський час).
 * Повертає { short, full } де:
 *   short — тільки дата (напр. «11 черв. 2026»)
 *   full  — дата + час для tooltip (напр. «11 черв. 2026, 10:45»)
 */
export function formatDate(value: string | null): { short: string; full: string } | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return { short: value, full: value };
  const short = date.toLocaleDateString(KY_LOCALE, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: KY_TZ,
  });
  const full = date.toLocaleString(KY_LOCALE, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: KY_TZ,
  });
  return { short, full };
}

/**
 * Конвертує HTML-опис OLX (з <br /> тегами) у plain text для безпечного рендеру.
 * <br>/<br/> → перенос рядка; решта тегів видаляється; основні HTML-ентіті декодуються.
 * Результат рендериться як текстовий вузол React (НЕ dangerouslySetInnerHTML) — XSS неможливий.
 */
export function stripDescriptionHtml(html: string | null): string {
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
