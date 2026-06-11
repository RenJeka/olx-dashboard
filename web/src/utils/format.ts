import type { Listing } from '../types';

/**
 * Форматує ціну оголошення у локалізований вигляд з валютою.
 */
export function formatPrice(l: Listing): string {
  if (l.price == null) return '—';
  return `${l.price.toLocaleString('uk-UA')} ${l.currency}`;
}

/**
 * Форматує ISO дату у коротку дату і час для відображення.
 */
export function formatDate(value: string | null): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('uk-UA', { dateStyle: 'short', timeStyle: 'short' });
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
