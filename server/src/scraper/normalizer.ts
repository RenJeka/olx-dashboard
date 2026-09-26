import type { InStatement } from '@libsql/client';
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

const SEARCH_LOCAL_FILTERS_SQL = 'SELECT local_filters FROM searches WHERE id = ?';

// Поля наявних рядків: для злиття (COALESCE) перед filtered_out + для діфу «чи реально щось
// змінилось» (docs/plans/turso-write-optimization.md). Якщо у GraphQL-рядка жодне бізнес-поле
// не змінилось — повний UPSERT пропускаємо (лишається дешевий touch last_seen_at/miss_count),
// щоб не множити Turso "rows written" на 4 (таблиця + 3 індекси) за кожен незмінний рядок.
// `id` НЕ потрібен — filtered_out пишеться у тому ж UPSERT (не окремим UPDATE by id).
const SELECT_EXISTING_FIELDS =
  'olx_id, title, url, price, currency, city, district, seller_type, params, category_id, ' +
  'category_type, photo_url, photo_urls, description, seller_name, contact_name, olx_status, ' +
  'posted_at, last_refresh_at, status, status_source, filtered_out, pros, cons';

/** Розмір чанка для IN-списку (ліміт змінних SQLite — 999). */
const IN_CHUNK = 500;

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
    last_seen_at, status, note, filtered_out
  )
  VALUES (
    @olx_id, @search_id, @title, @url, @price, @currency, @city, @district, @seller_type,
    COALESCE(@params, '{}'), @category_id, @category_type,
    @photo_url, @photo_urls, @description, @seller_name, @contact_name, @olx_status,
    @posted_at, @last_refresh_at, datetime('now'),
    CASE WHEN @is_graphql = 1 AND @olx_status_inactive = 1 THEN 'disabled' ELSE 'new' END,
    CASE WHEN @is_graphql = 1 AND @olx_status_inactive = 1 THEN @status_note ELSE '' END,
    @filtered_out
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
                     END,
    -- filtered_out перерахований у JS (на злитих COALESCE-значеннях) і переданий параметром.
    filtered_out  = @filtered_out
`;

// Дешевий «touch» для GraphQL-рядків без бізнес-змін: оновити лише last_seen_at + скинути
// miss_count (оголошення є у видачі). Throttle once/day — WHERE пропускає рядки, ще «свіжі»
// й уже з miss_count=0 (датою бачено сьогодні), тож для них write взагалі не виконується.
// last_seen_at без індексу (його прибрано) — це 1 table-write/рядок без index-write.
const TOUCH_PREFIX = `UPDATE listings SET last_seen_at = datetime('now'), miss_count = 0 WHERE olx_id IN (`;
const TOUCH_SUFFIX = `) AND (miss_count != 0 OR last_seen_at IS NULL OR last_seen_at < datetime('now', '-1 day'))`;

/** Наявні поля рядка: для злиття COALESCE (filtered_out) + діфу бізнес-змін перед upsert. */
interface ExistingFields {
  title: string | null;
  url: string | null;
  price: number | null;
  currency: string | null;
  city: string | null;
  district: string | null;
  seller_type: string | null;
  params: string | null;
  category_id: number | null;
  category_type: string | null;
  photo_url: string | null;
  photo_urls: string | null;
  description: string | null;
  seller_name: string | null;
  contact_name: string | null;
  olx_status: string | null;
  posted_at: string | null;
  last_refresh_at: string | null;
  status: string;
  status_source: string;
  filtered_out: number;
  pros: string | null;
  cons: string | null;
}

/** Обчислені (нормалізовані + злиті) значення GraphQL-рядка — для діфу проти ExistingFields. */
interface ComputedFields {
  title: string | null;
  url: string | null;
  price: number | null;
  currency: string;
  city: string | null;
  district: string | null;
  sellerType: string | null;
  params: string | null;
  categoryId: number | null;
  categoryType: string | null;
  photoUrl: string | null;
  photoUrls: string | null;
  description: string | null;
  sellerName: string | null;
  contactName: string | null;
  olxStatus: string | null;
  postedAt: string | null;
  lastRefreshAt: string | null;
  filteredOut: number;
  olxStatusInactive: boolean;
}

/**
 * Чи реально щось змінилось у GraphQL-рядку проти збереженого — дзеркало семантики UPSERT_SQL.
 * `true` (= потрібен повний upsert), якщо: будь-яке завжди-перезаписуване поле відрізняється;
 * GraphQL-дата відрізняється; filtered_out відрізняється; COALESCE-поле має новий НЕ-null,
 * що відрізняється; або статусний CASE дав би перехід (миттєвий disable / auto-реактивація).
 * За будь-якого сумніву віддаємо перевагу повному upsert — зайвий запис безпечний, пропуск ні.
 */
function hasBusinessChange(e: ExistingFields, c: ComputedFields): boolean {
  // Завжди-перезаписувані (без COALESCE) — зміна, якщо значення відрізняється.
  if (c.title !== e.title) return true;
  if (c.url !== e.url) return true;
  if (c.price !== e.price) return true;
  if (c.currency !== e.currency) return true;
  if (c.city !== e.city) return true;
  if (c.photoUrl !== e.photo_url) return true;
  // GraphQL-перезаписувані дати (posted_at/last_refresh_at).
  if (c.postedAt !== e.posted_at) return true;
  if (c.lastRefreshAt !== e.last_refresh_at) return true;
  // filtered_out (перерахований у JS на злитих значеннях).
  if (c.filteredOut !== e.filtered_out) return true;
  // COALESCE-поля: новий НЕ-null, що відрізняється від наявного → перезапис.
  if (c.olxStatus !== null && c.olxStatus !== e.olx_status) return true;
  if (c.description !== null && c.description !== e.description) return true;
  if (c.sellerName !== null && c.sellerName !== e.seller_name) return true;
  if (c.contactName !== null && c.contactName !== e.contact_name) return true;
  if (c.district !== null && c.district !== e.district) return true;
  if (c.sellerType !== null && c.sellerType !== e.seller_type) return true;
  if (c.params !== null && c.params !== e.params) return true;
  if (c.categoryId !== null && c.categoryId !== e.category_id) return true;
  if (c.categoryType !== null && c.categoryType !== e.category_type) return true;
  if (c.photoUrls !== null && c.photoUrls !== e.photo_urls) return true;
  // Статусні переходи (дзеркало CASE-гілок status у UPSERT_SQL):
  // миттєвий disable за olx_status≠active для auto/rejected, ще не disabled.
  if (
    c.olxStatusInactive &&
    e.status !== 'disabled' &&
    (e.status_source === 'auto' || e.status === 'rejected')
  ) {
    return true;
  }
  // auto-реактивація: disabled-auto знову живий → 'new'.
  if (!c.olxStatusInactive && e.status === 'disabled' && e.status_source === 'auto') return true;
  return false;
}

/**
 * Bulk-завантаження наявних рядків (по olx_id) для злиття COALESCE-полів перед filtered_out.
 * Один запит на чанк замість N×EXISTS+SELECT — на Turso це economія мережевих round-trip.
 */
async function loadExistingByOlxId(olxIds: number[]): Promise<Map<number, ExistingFields>> {
  const map = new Map<number, ExistingFields>();
  for (let i = 0; i < olxIds.length; i += IN_CHUNK) {
    const chunk = olxIds.slice(i, i + IN_CHUNK);
    const placeholders = chunk.map(() => '?').join(', ');
    const rows = await dbAll<ExistingFields & { olx_id: number }>(
      `SELECT ${SELECT_EXISTING_FIELDS} FROM listings WHERE olx_id IN (${placeholders})`,
      chunk,
    );
    for (const r of rows) map.set(r.olx_id, r);
  }
  return map;
}

/**
 * Upsert розпарсених оголошень по olx_id.
 * price_history НЕ чіпаємо (Етап 3). filtered_out рахується в JS на злитих (COALESCE)
 * значеннях і пишеться у тому ж UPSERT — без окремого read-back/UPDATE.
 *
 * Потік (мінімум мережевих round-trip для Turso):
 *   1) один bulk-SELECT наявних рядків по olx_id (чанками);
 *   2) у пам'яті: new_count + злиття COALESCE-полів + filtered_out;
 *   3) один db.batch('write') усіх UPSERT-ів (атомарно, як транзакція).
 * Повертає кількість знайдених і нових.
 */
export async function upsertListings(
  searchId: number,
  raw: RawListing[],
): Promise<Pick<ScanResult, 'found' | 'new_count'>> {
  if (raw.length === 0) return { found: 0, new_count: 0 };

  const localFiltersRow = await dbGet<{ local_filters: string }>(SEARCH_LOCAL_FILTERS_SQL, [
    searchId,
  ]);
  let localFilters: LocalFilters = {};
  try {
    localFilters = JSON.parse(localFiltersRow?.local_filters || '{}') as LocalFilters;
  } catch {
    localFilters = {};
  }

  const existingMap = await loadExistingByOlxId(raw.map((r) => r.olxId));

  let newCount = 0;
  // Дублі в межах одного raw (одне оголошення на кількох сторінках) рахуються як новий один раз,
  // як і в попередній EXISTS-логіці (друга поява вже «існує»).
  const seen = new Set<number>();
  const statements: InStatement[] = [];
  // olx_id GraphQL-рядків без бізнес-змін — їм лише дешевий touch (без повного upsert).
  const touchOlxIds: number[] = [];

  for (const item of raw) {
    const existing = existingMap.get(item.olxId);
    const isNew = existing === undefined && !seen.has(item.olxId);
    if (isNew) newCount++;
    seen.add(item.olxId);

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
    const categoryId = hasStructuredData ? (item.categoryId ?? null) : null;
    const categoryType = hasStructuredData ? (item.categoryType ?? null) : null;
    const lastRefreshAt = hasStructuredData ? (item.lastRefreshAt ?? null) : null;
    const titleVal = item.title || null;
    const urlVal = item.url || null;
    const photoUrl = item.photoUrl ?? null;
    const photoUrls =
      item.photoUrls && item.photoUrls.length > 0 ? JSON.stringify(item.photoUrls) : null;

    // Злиті значення — дзеркало COALESCE в UPSERT_SQL (новий ?? наявний), щоб filtered_out
    // збігався з тим, що реально опиниться у рядку після upsert.
    const filteredOut = evaluateFilteredOut(localFilters, {
      title: titleVal,
      description: description ?? existing?.description ?? null,
      params: params ?? existing?.params ?? '{}',
      price,
      city,
      seller_name: sellerName ?? existing?.seller_name ?? null,
      pros: existing?.pros ?? '',
      cons: existing?.cons ?? '',
      category_id: categoryId ?? existing?.category_id ?? null,
    });
    const filteredOutInt = filteredOut ? 1 : 0;

    // Класифікація запису: повний UPSERT лише для нових / HTML-fallback / реально змінених
    // GraphQL-рядків. Незмінні GraphQL-рядки → дешевий touch (docs/plans/turso-write-optimization.md).
    const needsUpsert =
      existing === undefined ||
      !hasStructuredData ||
      hasBusinessChange(existing, {
        title: titleVal,
        url: urlVal,
        price,
        currency,
        city,
        district,
        sellerType,
        params,
        categoryId,
        categoryType,
        photoUrl,
        photoUrls,
        description,
        sellerName,
        contactName,
        olxStatus,
        postedAt,
        lastRefreshAt,
        filteredOut: filteredOutInt,
        olxStatusInactive,
      });

    if (!needsUpsert) {
      touchOlxIds.push(item.olxId);
      continue;
    }

    statements.push({
      sql: UPSERT_SQL,
      args: {
        olx_id: item.olxId,
        search_id: searchId,
        title: titleVal,
        url: urlVal,
        price,
        currency,
        city,
        district,
        seller_type: sellerType,
        params,
        category_id: categoryId,
        category_type: categoryType,
        photo_url: photoUrl,
        photo_urls: photoUrls,
        description,
        seller_name: sellerName,
        contact_name: contactName,
        olx_status: olxStatus,
        posted_at: postedAt,
        last_refresh_at: lastRefreshAt,
        is_graphql: hasStructuredData ? 1 : 0,
        olx_status_inactive: olxStatusInactive ? 1 : 0,
        status_note: olxStatusInactive ? `auto-disabled: olx_status=${olxStatus}` : '',
        filtered_out: filteredOutInt,
      },
    });
  }

  // Дешевий touch незмінних рядків — чанками (ліміт IN). WHERE у TOUCH_SUFFIX додатково
  // відсіює рядки, ще «свіжі» за last_seen_at (throttle once/day) — для них write не виконується.
  for (let i = 0; i < touchOlxIds.length; i += IN_CHUNK) {
    const chunk = touchOlxIds.slice(i, i + IN_CHUNK);
    const placeholders = chunk.map(() => '?').join(', ');
    statements.push({ sql: `${TOUCH_PREFIX}${placeholders}${TOUCH_SUFFIX}`, args: chunk });
  }

  // Один round-trip: усі UPSERT-и + touch виконуються атомарно (libSQL batch = транзакція).
  if (statements.length > 0) await db.batch(statements, 'write');

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
