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

// district/seller_type/params/description/seller_name/contact_name/olx_status: COALESCE
// на оновленні — якщо новий скан (HTML-fallback) не приносить ці поля (null), не затираємо
// вже зібрані GraphQL-дані.
const upsertStmt = db.prepare(`
  INSERT INTO listings (
    olx_id, search_id, title, url, price, currency, city, district, seller_type, params,
    photo_url, description, seller_name, contact_name, olx_status, posted_at, last_seen_at
  )
  VALUES (
    @olx_id, @search_id, @title, @url, @price, @currency, @city, @district, @seller_type,
    COALESCE(@params, '{}'), @photo_url, @description, @seller_name, @contact_name, @olx_status,
    @posted_at, datetime('now')
  )
  ON CONFLICT(olx_id) DO UPDATE SET
    title         = excluded.title,
    url           = excluded.url,
    price         = excluded.price,
    currency      = excluded.currency,
    city          = excluded.city,
    district      = COALESCE(excluded.district, district),
    seller_type   = COALESCE(excluded.seller_type, seller_type),
    params        = COALESCE(@params, params, '{}'),
    photo_url     = excluded.photo_url,
    description   = COALESCE(excluded.description, description),
    seller_name   = COALESCE(excluded.seller_name, seller_name),
    contact_name  = COALESCE(excluded.contact_name, contact_name),
    olx_status    = COALESCE(excluded.olx_status, olx_status),
    posted_at     = excluded.posted_at,
    last_seen_at  = datetime('now')
`);

/**
 * Upsert розпарсених оголошень по olx_id.
 * price_history та filtered_out НЕ чіпаємо (Етапи 2–3).
 * Повертає кількість знайдених і нових.
 */
export function upsertListings(
  searchId: number,
  raw: RawListing[],
): Omit<ScanResult, 'requestsUsed'> {
  let newCount = 0;

  const run = db.transaction((items: RawListing[]) => {
    for (const item of items) {
      const isNew = existsStmt.get(item.olxId) === undefined;
      if (isNew) newCount++;

      // Структуровані поля присутні (GraphQL-фетчер) — пріоритет їм.
      // HTML-фетчер createdAt не заповнює, тому це надійний дискримінатор.
      const hasStructuredData = item.createdAt !== undefined;

      let price: number | null;
      let currency: string;
      let city: string | null;
      let postedAt: string | null;
      let district: string | null = null;
      let sellerType: string | null = null;
      let params: string | null = null;
      let description: string | null = null;
      let sellerName: string | null = null;
      let contactName: string | null = null;
      let olxStatus: string | null = null;

      if (hasStructuredData) {
        price = item.price ?? null;
        currency = item.currency ?? 'UAH';
        city = item.city ?? null;
        district = item.district ?? null;
        postedAt = item.createdAt ?? null;
        sellerType = item.sellerType ?? null;
        params = item.params ? JSON.stringify(item.params) : null;
        description = item.description ?? null;
        sellerName = item.sellerName ?? null;
        contactName = item.contactName ?? null;
        olxStatus = item.olxStatus ?? null;
      } else {
        const parsedPrice = parsePrice(item.rawPrice);
        price = parsedPrice.price;
        currency = parsedPrice.currency;

        const parsedLocation = parseLocationDate(item.locationDate);
        city = parsedLocation.city;
        postedAt = parsedLocation.postedAt;
      }

      upsertStmt.run({
        olx_id: item.olxId,
        search_id: searchId,
        title: item.title || null,
        url: item.url || null,
        price,
        currency,
        city,
        district,
        seller_type: sellerType,
        params,
        photo_url: item.photoUrl ?? null,
        description,
        seller_name: sellerName,
        contact_name: contactName,
        olx_status: olxStatus,
        posted_at: postedAt,
      });
    }
  });

  run(raw);

  return { found: raw.length, new_count: newCount };
}
