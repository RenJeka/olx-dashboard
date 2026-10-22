import type { InStatement } from '@libsql/client';
import { db, dbAll, dbGet, dbRun } from '../db.js';
import type { AnalysisMode, CommitItem, PickCandidate, PickItem, RelevanceItem } from '../../types.js';

export interface ListingRow {
  id: number;
  title: string | null;
  description: string | null;
  params: string | null;
}

/** Рядок пошуку для AI-роутів; поля автокатегорії — для ефективних критеріїв (analysis/baseCriteria.ts). */
export interface SearchRow {
  id: number;
  name: string;
  analysis_criteria: string;
  base_category_id: number | null;
  base_disabled: string | null;
}

export async function getSearch(id: number): Promise<SearchRow | undefined> {
  return dbGet<SearchRow>(
    'SELECT id, name, analysis_criteria, base_category_id, base_disabled FROM searches WHERE id = ?',
    [id],
  );
}

/**
 * Цільовий товар семантичного фільтра. Якщо relevance_target порожній — повертаємо query
 * пошуку як передзаповнення (щоб перший прогін мав осмислену ціль).
 */
export async function getRelevanceTarget(searchId: number): Promise<string> {
  const row = await dbGet<{ relevance_target: string | null; query: string }>(
    'SELECT relevance_target, query FROM searches WHERE id = ?',
    [searchId],
  );
  if (!row) return '';
  return (row.relevance_target ?? '').trim() || row.query;
}

/** Зберігає цільовий товар на рівні пошуку (для повторних прогонів). */
export async function setRelevanceTarget(searchId: number, target: string): Promise<void> {
  await dbRun('UPDATE searches SET relevance_target = ? WHERE id = ?', [target, searchId]);
}

/**
 * Синоніми query (docs/plans/old/search-synonyms.md) як alias-назви товару для AI-фільтра
 * релевантності — оголошення, що продає товар під будь-яким із синонімів, теж релевантне.
 */
export async function getRelevanceAliases(searchId: number): Promise<string[]> {
  const row = await dbGet<{ query_synonyms: string | null }>(
    'SELECT query_synonyms FROM searches WHERE id = ?',
    [searchId],
  );
  if (!row) return [];
  try {
    const parsed = JSON.parse(row.query_synonyms || '[]');
    return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === 'string' && v.trim() !== '') : [];
  } catch {
    return [];
  }
}

/** Завантажує оголошення за id (або всі пошуку, якщо ids порожній). */
export async function loadListings(searchId: number, ids: number[]): Promise<ListingRow[]> {
  if (ids.length === 0) {
    return dbAll<ListingRow>('SELECT id, title, description, params FROM listings WHERE search_id = ?', [
      searchId,
    ]);
  }
  const placeholders = ids.map(() => '?').join(',');
  return dbAll<ListingRow>(
    `SELECT id, title, description, params FROM listings WHERE search_id = ? AND id IN (${placeholders})`,
    [searchId, ...ids],
  );
}

/**
 * Кандидати для AI-ранжування: без мінусів, активні, не відфільтровані, релевантні
 * (`ai_relevant IS NOT 0` лишає 1 та NULL-«не перевірено», відсікає нерелевантні),
 * відсортовані за ціною ASC (NULL-ціна в кінці), ліміт `limit` (PICK_CANDIDATES_LIMIT у викликача).
 * Предикат збігається з вкладкою «Найкращі кандидати» в UI.
 *
 * Якщо передано `ids` (обсяг із UI ≠ «Найкращі кандидати»), пул беруть ЛИШЕ з цих ID
 * без дефолтного предиката (користувач свідомо обрав інший обсяг); сортування за ціною
 * й ліміт лишаються.
 */
export async function loadPickCandidates(searchId: number, limit: number, ids?: number[]): Promise<PickCandidate[]> {
  if (ids && ids.length > 0) {
    const placeholders = ids.map(() => '?').join(',');
    return dbAll<PickCandidate>(
      `SELECT id, title, price, city, params, description, pros
         FROM listings
         WHERE search_id = ? AND id IN (${placeholders})
         ORDER BY CASE WHEN price IS NULL THEN 1 ELSE 0 END, price ASC
         LIMIT ?`,
      [searchId, ...ids, limit],
    );
  }
  return dbAll<PickCandidate>(
    `SELECT id, title, price, city, params, description, pros
       FROM listings
       WHERE search_id = ? AND cons = '' AND status NOT IN ('disabled','rejected')
         AND filtered_out = 0 AND ai_relevant IS NOT 0
       ORDER BY CASE WHEN price IS NULL THEN 1 ELSE 0 END, price ASC
       LIMIT ?`,
    [searchId, limit],
  );
}

// ── Критерії пошуку (мінуси/плюси) ──────────────────────────────────────────

/** Стан критеріїв пошуку для remap: власні критерії, фільтри, автокатегорія, вимкнені базові. */
export interface SearchCriteriaState {
  analysis_criteria: string;
  local_filters: string;
  base_category_id: number | null;
  base_disabled: string | null;
}

export function getSearchCriteriaState(searchId: number): Promise<SearchCriteriaState | undefined> {
  return dbGet<SearchCriteriaState>(
    'SELECT analysis_criteria, local_filters, base_category_id, base_disabled FROM searches WHERE id = ?',
    [searchId],
  );
}

/** Рядок пошуку для ефективних критеріїв (власні + базові автокатегорії). */
export function getSearchCriteriaRow(
  searchId: number,
): Promise<{ analysis_criteria: string | null; base_category_id: number | null; base_disabled: string | null } | undefined> {
  return dbGet('SELECT analysis_criteria, base_category_id, base_disabled FROM searches WHERE id = ?', [searchId]);
}

export async function getSearchLocalFilters(searchId: number): Promise<string | null | undefined> {
  return (await dbGet<{ local_filters: string | null }>('SELECT local_filters FROM searches WHERE id = ?', [searchId]))
    ?.local_filters;
}

export async function updateSearchCriteria(searchId: number, criteria: string, baseDisabled: string): Promise<void> {
  await dbRun('UPDATE searches SET analysis_criteria = ?, base_disabled = ? WHERE id = ?', [
    criteria,
    baseDisabled,
    searchId,
  ]);
}

/** Statement для batch: критерії й фільтри пошуку разом. */
export function searchCriteriaStatement(searchId: number, criteria: string, localFilters: string): InStatement {
  return {
    sql: 'UPDATE searches SET analysis_criteria = ?, local_filters = ? WHERE id = ?',
    args: [criteria, localFilters, searchId],
  };
}

/** Оголошення пошуку з непорожнім полем режиму (`mode` — з whitelist isMode). */
export function listListingCriteria(searchId: number, mode: AnalysisMode): Promise<{ id: number; val: string | null }[]> {
  return dbAll<{ id: number; val: string | null }>(
    `SELECT id, ${mode} AS val FROM listings WHERE search_id = ? AND ${mode} <> ''`,
    [searchId],
  );
}

/** Statement для batch: нове значення поля режиму оголошення. */
export function listingCriteriaStatement(mode: AnalysisMode, listingId: number, text: string | null): InStatement {
  return { sql: `UPDATE listings SET ${mode} = ? WHERE id = ?`, args: [text, listingId] };
}

// ── Запис результатів AI (інтерактивні транзакції) ───────────────────────────

/**
 * Записати мінуси/плюси оголошень однією write-транзакцією. `toText` будує текст поля з нових пунктів і наявного
 * значення (`append` — наявне читається в тій самій транзакції; інакше `existing` = undefined).
 * Повертає кількість змінених рядків.
 */
export async function commitListingCriteria(
  mode: AnalysisMode,
  items: CommitItem[],
  meta: { source: string; model: string; append: boolean },
  toText: (existing: string | null | undefined, criteria: string[]) => string,
): Promise<number> {
  // mode — з whitelist (isMode): 'cons' | 'pros', безпечна інтерполяція.
  const UPDATE_SQL = `UPDATE listings SET ${mode} = ?, analysis_at = datetime('now'),
              analysis_source = ?, analysis_model = ?, analysis_stale = 0
       WHERE id = ?`;
  const SELECT_SQL = `SELECT ${mode} AS val FROM listings WHERE id = ?`;

  // Інтерактивна транзакція: append-режим читає наявне значення перед записом → атомарність циклу.
  const tx = await db.transaction('write');
  let updated = 0;
  try {
    for (const row of items) {
      let existing: string | null | undefined;
      if (meta.append) {
        const existingRows = await tx.execute({ sql: SELECT_SQL, args: [row.id] });
        existing = (existingRows.rows[0] as unknown as { val: string | null } | undefined)?.val ?? null;
      }
      const info = await tx.execute({ sql: UPDATE_SQL, args: [toText(existing, row.criteria), meta.source, meta.model, row.id] });
      updated += info.rowsAffected;
    }
    await tx.commit();
  } catch (err) {
    await tx.rollback();
    throw err;
  }
  return updated;
}

/** AI Вибір: скинути старі ранги пошуку й записати нові атомарно. Повертає кількість записаних. */
export async function commitAiPicks(searchId: number, picks: PickItem[]): Promise<number> {
  const CLEAR_SQL = `UPDATE listings SET ai_rank = NULL, ai_pick_reason = NULL, ai_ranked_at = NULL
         WHERE search_id = ?`;
  const SET_SQL = `UPDATE listings SET ai_rank = ?, ai_pick_reason = ?, ai_ranked_at = datetime('now')
         WHERE id = ? AND search_id = ?`;

  const tx = await db.transaction('write');
  let committed = 0;
  try {
    await tx.execute({ sql: CLEAR_SQL, args: [searchId] });
    for (const pick of picks) {
      const info = await tx.execute({ sql: SET_SQL, args: [pick.rank, pick.reason, pick.id, searchId] });
      committed += info.rowsAffected;
    }
    await tx.commit();
  } catch (err) {
    await tx.rollback();
    throw err;
  }
  return committed;
}

/** Релевантність пакетом; ручні override (source='manual') НЕ перетираються (WHERE). Повертає кількість записаних. */
export async function commitRelevance(searchId: number, items: RelevanceItem[], source: string): Promise<number> {
  const SET_SQL = `UPDATE listings
       SET ai_relevant = ?, ai_relevant_reason = ?, ai_relevant_at = datetime('now'), ai_relevant_source = ?
       WHERE id = ? AND search_id = ? AND (ai_relevant_source IS NULL OR ai_relevant_source != 'manual')`;

  const tx = await db.transaction('write');
  let committed = 0;
  try {
    for (const item of items) {
      const info = await tx.execute({
        sql: SET_SQL,
        args: [item.relevant ? 1 : 0, item.reason, source, item.id, searchId],
      });
      committed += info.rowsAffected;
    }
    await tx.commit();
  } catch (err) {
    await tx.rollback();
    throw err;
  }
  return committed;
}
