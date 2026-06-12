/** Родові форми місяців у текстових датах OLX («30 травня 2026 р.»). */
const MONTHS_GENITIVE: Record<string, number> = {
  січня: 1,
  лютого: 2,
  березня: 3,
  квітня: 4,
  травня: 5,
  червня: 6,
  липня: 7,
  серпня: 8,
  вересня: 9,
  жовтня: 10,
  листопада: 11,
  грудня: 12,
};

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

function formatDate(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

const TODAY_RE = /^Сьогодні о (\d{1,2}):(\d{2})$/i;
const YESTERDAY_RE = /^Вчора о (\d{1,2}):(\d{2})$/i;
const DATE_RE = /^(\d{1,2}) ([а-яіїєґ]+) (\d{4}) р\.?$/iu;

/**
 * Парсить текстову дату HTML-fallback (блок "location-date" сторінки списку OLX) в
 * ISO-формат, сумісний з ISO-датами GraphQL (`created_time`) — для коректного
 * лексикографічного порівняння у `statusEngine.ts`.
 *
 * - «Сьогодні о HH:MM» → `YYYY-MM-DDTHH:MM:00` (дата `now`, дефолт — поточний момент)
 * - «Вчора о HH:MM» → те саме, дата `now` мінус 1 день
 * - «D <місяць_родовий> YYYY р.» (напр. «30 травня 2026 р.») → `YYYY-MM-DD`
 * - нерозпізнаний формат / порожнє значення → `null`
 */
export function parseOlxDate(raw: string | null | undefined, now: Date = new Date()): string | null {
  if (!raw) return null;
  const text = raw.trim();

  const todayMatch = text.match(TODAY_RE);
  if (todayMatch) {
    const [, hh, mm] = todayMatch;
    return `${formatDate(now)}T${pad(Number(hh))}:${mm}:00`;
  }

  const yesterdayMatch = text.match(YESTERDAY_RE);
  if (yesterdayMatch) {
    const [, hh, mm] = yesterdayMatch;
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    return `${formatDate(yesterday)}T${pad(Number(hh))}:${mm}:00`;
  }

  const dateMatch = text.match(DATE_RE);
  if (dateMatch) {
    const [, day, monthName, year] = dateMatch;
    const month = monthName ? MONTHS_GENITIVE[monthName.toLowerCase()] : undefined;
    if (!month) return null;
    return `${year}-${pad(month)}-${pad(Number(day))}`;
  }

  return null;
}
