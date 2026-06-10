import { db } from '../db/db.js';
import type { RawListing, NormalizedPrice, ScanResult } from '../types.js';

/**
 * Нормалізує сирий рядок ціни OLX.
 * "6 000 грн." → { price: 6000, currency: 'UAH' }
 * "Договірна" / "" → { price: null, currency: 'UAH' }
 */
export function parsePrice(raw: string): NormalizedPrice {
  const text = (raw ?? '').replace(/ /g, ' ');

  let currency = 'UAH';
  if (/грн/i.test(text)) currency = 'UAH';
  else if (/\$|usd/i.test(text)) currency = 'USD';
  else if (/€|eur/i.test(text)) currency = 'EUR';

  // Лишаємо тільки цифри (прибираючи пробіли-роздільники тисяч).
  const digits = text.replace(/[^\d]/g, '');
  const price = digits.length > 0 ? Number(digits) : null;

  return { price, currency };
}

/**
 * Розбиває блок "location-date" на місто та сирий рядок дати.
 * "Київ - Сьогодні о 12:00" → { city: 'Київ', postedAt: 'Сьогодні о 12:00' }
 */
function parseLocationDate(raw?: string): {
  city: string | null;
  postedAt: string | null;
} {
  if (!raw) return { city: null, postedAt: null };

  const idx = raw.indexOf(' - ');
  if (idx === -1) {
    return { city: raw.trim() || null, postedAt: null };
  }

  const city = raw.slice(0, idx).trim() || null;
  const postedAt = raw.slice(idx + 3).trim() || null;
  return { city, postedAt };
}

const existsStmt = db.prepare('SELECT 1 FROM listings WHERE olx_id = ?');

const upsertStmt = db.prepare(`
  INSERT INTO listings (olx_id, search_id, title, url, price, currency, city, photo_url, posted_at, last_seen_at)
  VALUES (@olx_id, @search_id, @title, @url, @price, @currency, @city, @photo_url, @posted_at, datetime('now'))
  ON CONFLICT(olx_id) DO UPDATE SET
    title       = excluded.title,
    url         = excluded.url,
    price       = excluded.price,
    currency    = excluded.currency,
    city        = excluded.city,
    photo_url   = excluded.photo_url,
    posted_at   = excluded.posted_at,
    last_seen_at = datetime('now')
`);

/**
 * Upsert розпарсених оголошень по olx_id.
 * price_history та filtered_out НЕ чіпаємо (Етапи 2–3).
 * Повертає кількість знайдених і нових.
 */
export function upsertListings(
  searchId: number,
  raw: RawListing[],
): ScanResult {
  let newCount = 0;

  const run = db.transaction((items: RawListing[]) => {
    for (const item of items) {
      const isNew = existsStmt.get(item.olxId) === undefined;
      if (isNew) newCount++;

      const { price, currency } = parsePrice(item.rawPrice);
      const { city, postedAt } = parseLocationDate(item.locationDate);

      upsertStmt.run({
        olx_id: item.olxId,
        search_id: searchId,
        title: item.title || null,
        url: item.url || null,
        price,
        currency,
        city,
        photo_url: item.photoUrl ?? null,
        posted_at: postedAt,
      });
    }
  });

  run(raw);

  return { found: raw.length, new_count: newCount };
}
