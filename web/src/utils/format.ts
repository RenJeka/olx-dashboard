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
 * Форматує ISO-дату (UTC) у відносний час «X тому» для рядка останнього скану.
 */
export function formatRelativeTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  const diffMin = Math.floor((Date.now() - date.getTime()) / 60000);
  if (diffMin < 1) return 'щойно';
  if (diffMin < 60) return `${diffMin} хв тому`;
  const diffHour = Math.floor(diffMin / 60);
  if (diffHour < 24) return `${diffHour} год тому`;
  const diffDay = Math.floor(diffHour / 24);
  return `${diffDay} дн тому`;
}

/**
 * Рахує кількість пунктів у тексті «Плюси»/«Мінуси» (формат `• criterion\n• …`,
 * сумісний з ручним едітом). Один непорожній рядок = один пункт; маркер `•` і
 * пробіли не впливають на підрахунок. Порожнє/`null` → 0.
 */
export function countProsConsItems(text: string | null): number {
  if (!text) return 0;
  return text.split('\n').filter((line) => line.trim() !== '').length;
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
