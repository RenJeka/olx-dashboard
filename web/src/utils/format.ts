import type { Listing } from '../types';

/**
 * Форматує ціну оголошення у локалізований вигляд з валютою.
 */
export function formatPrice(l: Listing): string {
  if (l.price == null) return '—';
  return `${l.price.toLocaleString('uk-UA')} ${l.currency}`;
}

/**
 * Витягує діапазон цін із `search.api_filters` (`{ ranges: { price: { from, to } } }`).
 * Повертає `null`, якщо діапазону немає або обидві межі порожні.
 */
export function parsePriceRange(apiFiltersRaw: string): { from?: number; to?: number } | null {
  try {
    const parsed = JSON.parse(apiFiltersRaw || '{}') as {
      ranges?: { price?: { from?: number; to?: number } };
    };
    const price = parsed.ranges?.price;
    if (!price) return null;
    if (price.from == null && price.to == null) return null;
    return price;
  } catch {
    return null;
  }
}

/**
 * Форматує діапазон цін для відображення (валюта не зберігається → «грн»):
 *   обидві межі → «1 000 – 5 000 грн», лише from → «від 1 000 грн»,
 *   лише to → «до 5 000 грн», порожньо → `null`.
 */
export function formatPriceRange(from?: number | null, to?: number | null): string | null {
  const hasFrom = from != null;
  const hasTo = to != null;
  if (!hasFrom && !hasTo) return null;
  const fmt = (n: number) => n.toLocaleString('uk-UA');
  if (hasFrom && hasTo) return `${fmt(from)} – ${fmt(to)} грн`;
  if (hasFrom) return `від ${fmt(from)} грн`;
  return `до ${fmt(to as number)} грн`;
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
