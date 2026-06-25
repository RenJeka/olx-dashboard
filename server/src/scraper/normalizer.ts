import { db, dbAll, dbGet } from '../db/db.js';
import { evaluateFilteredOut } from './localFilters.js';
import { parseOlxDate } from './dateParser.js';
import type { RawListing, NormalizedPrice, ScanResult, LocalFilters } from '../types.js';

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

const EXISTS_SQL = 'SELECT 1 FROM listings WHERE olx_id = ?';
const SEARCH_LOCAL_FILTERS_SQL = 'SELECT local_filters FROM searches WHERE id = ?';
const SELECT_FOR_FILTER_SQL =
  'SELECT id, title, description, params, price, city, seller_name, pros, cons, category_id FROM listings WHERE olx_id = ?';
const UPDATE_FILTERED_OUT_SQL = 'UPDATE listings SET filtered_out = ? WHERE id = ?';

// district/seller_type/params/description/seller_name/contact_name/olx_status: COALESCE
// на оновленні — якщо новий скан (HTML-fallback) не приносить ці поля (null), не затираємо
// вже зібрані GraphQL-дані.
//
// Статусна логіка (Етап 2, лише @is_graphql=1, тобто дані з GraphQL):
// - miss_count скидається в 0 — оголошення присутнє у видачі цього скану;
// - posted_at/last_refresh_at оновлюються лише з GraphQL (HTML-fallback дат не дає —
//   не затираємо ISO-дати);
// - olx_status ≠ 'active' → миттєвий disable (auto-рядки і manual 'rejected' — факт
//   зникнення сильніший за оцінку), з позначкою в note для ручної перевірки (CLAUDE.md);
// - auto-рядок, що був disabled і знову з'явився живим → auto-reactivate в 'new'.
const UPSERT_SQL = `
  INSERT INTO listings (
    olx_id, search_id, title, url, price, currency, city, district, seller_type, params,
    category_id, category_type,
    photo_url, photo_urls, description, seller_name, contact_name, olx_status, posted_at, last_refresh_at,
    last_seen_at, status, note
  )
  VALUES (
    @olx_id, @search_id, @title, @url, @price, @currency, @city, @district, @seller_type,
    COALESCE(@params, '{}'), @category_id, @category_type,
    @photo_url, @photo_urls, @description, @seller_name, @contact_name, @olx_status,
    @posted_at, @last_refresh_at, datetime('now'),
    CASE WHEN @is_graphql = 1 AND @olx_status_inactive = 1 THEN 'disabled' ELSE 'new' END,
    CASE WHEN @is_graphql = 1 AND @olx_status_inactive = 1 THEN @status_note ELSE '' END
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
    category_id   = COALESCE(excluded.category_id, category_id),
    category_type = COALESCE(excluded.category_type, category_type),
    photo_url     = excluded.photo_url,
    photo_urls    = COALESCE(excluded.photo_urls, photo_urls),
    description   = COALESCE(excluded.description, description),
    seller_name   = COALESCE(excluded.seller_name, seller_name),
    contact_name  = COALESCE(excluded.contact_name, contact_name),
    olx_status    = COALESCE(excluded.olx_status, olx_status),
    posted_at     = CASE WHEN @is_graphql = 1 THEN excluded.posted_at ELSE posted_at END,
    last_refresh_at = CASE WHEN @is_graphql = 1 THEN excluded.last_refresh_at ELSE last_refresh_at END,
    last_seen_at  = datetime('now'),
    miss_count    = CASE WHEN @is_graphql = 1 THEN 0 ELSE miss_count END,
    status        = CASE
                       WHEN @is_graphql = 1 AND @olx_status_inactive = 1
                            AND (status_source = 'auto' OR status = 'rejected')
                         THEN 'disabled'
                       WHEN @is_graphql = 1 AND @olx_status_inactive = 0
                            AND status_source = 'auto' AND status = 'disabled'
                         THEN 'new'
                       ELSE status
                     END,
    note          = CASE
                       WHEN @is_graphql = 1 AND @olx_status_inactive = 1
                            AND (status_source = 'auto' OR status = 'rejected')
                            AND (note IS NULL OR note NOT LIKE '%' || @status_note || '%')
                         THEN CASE WHEN note IS NULL OR note = '' THEN @status_note
                                   ELSE note || char(10) || @status_note END
                       ELSE note
                     END,
    -- A6 (LLM-аналіз): title/description змінились після аналізу → бейдж «застарілий аналіз».
    -- RHS бере СТАРІ значення рядка (до UPDATE). description-порівняння лише коли новий не NULL
    -- (HTML-fallback опису не дає — COALESCE його не змінює, не позначаємо застарілим хибно).
    analysis_stale = CASE
                       WHEN analysis_at IS NOT NULL
                            AND ( title IS NOT excluded.title
                                  OR (excluded.description IS NOT NULL
                                      AND description IS NOT excluded.description) )
                         THEN 1
                       ELSE analysis_stale
                     END
`;

/**
 * Upsert розпарсених оголошень по olx_id.
 * price_history НЕ чіпаємо (Етап 3). filtered_out перераховується через локальні
 * фільтри пошуку (Етап 2) — після upsert, бо враховує COALESCE'ні description/params.
 * Повертає кількість знайдених і нових.
 */
export async function upsertListings(
  searchId: number,
  raw: RawListing[],
): Promise<Pick<ScanResult, 'found' | 'new_count'>> {
  let newCount = 0;

  const localFiltersRow = await dbGet<{ local_filters: string }>(SEARCH_LOCAL_FILTERS_SQL, [
    searchId,
  ]);
  let localFilters: LocalFilters = {};
  try {
    localFilters = JSON.parse(localFiltersRow?.local_filters || '{}') as LocalFilters;
  } catch {
    localFilters = {};
  }

  // Інтерактивна транзакція libSQL: цикл містить читання (exists/persisted) + умовні записи,
  // тож db.batch не підходить — потрібна атомарність усього циклу (як db.transaction раніше).
  const tx = await db.transaction('write');
  try {
    for (const item of raw) {
      const existing = await tx.execute({ sql: EXISTS_SQL, args: [item.olxId] });
      const isNew = existing.rows.length === 0;
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
        postedAt = parseOlxDate(parsedLocation.postedAt);
      }

      const olxStatusInactive = hasStructuredData && olxStatus != null && olxStatus !== 'active';

      await tx.execute({
        sql: UPSERT_SQL,
        args: {
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
        category_id: hasStructuredData ? (item.categoryId ?? null) : null,
        category_type: hasStructuredData ? (item.categoryType ?? null) : null,
        photo_url: item.photoUrl ?? null,
        photo_urls:
          item.photoUrls && item.photoUrls.length > 0 ? JSON.stringify(item.photoUrls) : null,
        description,
        seller_name: sellerName,
        contact_name: contactName,
        olx_status: olxStatus,
        posted_at: postedAt,
        last_refresh_at: hasStructuredData ? (item.lastRefreshAt ?? null) : null,
        is_graphql: hasStructuredData ? 1 : 0,
        olx_status_inactive: olxStatusInactive ? 1 : 0,
        status_note: olxStatusInactive ? `auto-disabled: olx_status=${olxStatus}` : '',
        },
      });

      const persistedRows = await tx.execute({ sql: SELECT_FOR_FILTER_SQL, args: [item.olxId] });
      const persisted = persistedRows.rows[0] as unknown as
        | {
            id: number;
            title: string | null;
            description: string | null;
            params: string | null;
            price: number | null;
            city: string | null;
            seller_name: string | null;
            pros: string | null;
            cons: string | null;
            category_id: number | null;
          }
        | undefined;
      if (persisted) {
        const filteredOut = evaluateFilteredOut(localFilters, persisted);
        await tx.execute({ sql: UPDATE_FILTERED_OUT_SQL, args: [filteredOut ? 1 : 0, persisted.id] });
      }
    }
    await tx.commit();
  } catch (err) {
    await tx.rollback();
    throw err;
  }

  return { found: raw.length, new_count: newCount };
}

/**
 * Які з переданих olx_id уже є в БД — для оцінки «~нових» у звіті аналітичної фази
 * глибокого скану (docs/plans/two-phase-deep-scan.md). Батч одним запитом замість N окремих.
 */
export async function selectKnownOlxIds(olxIds: number[]): Promise<Set<number>> {
  if (olxIds.length === 0) return new Set();
  const placeholders = olxIds.map(() => '?').join(', ');
  const rows = await dbAll<{ olx_id: number }>(
    `SELECT olx_id FROM listings WHERE olx_id IN (${placeholders})`,
    olxIds,
  );
  return new Set(rows.map((r) => r.olx_id));
}
