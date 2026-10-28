import { BadRequestError, NotFoundError } from '../errors.js';
import { logWarn } from '../logger.js';
import { invalidateCorpus } from '../cache/textCorpus.js';
import { refreshBaseCategory } from '../categories/tree.js';
import { recomputeFilteredOut } from '../scraper/refilter.js';
import { parseBullets } from '../analysis/text.js';
import { isAnalysisFresh } from '../scanner/index.js';
import {
  deleteSearchCascade,
  findSearchNeighbor,
  getCategoryFacet,
  getSearchPosition,
  getSearchRecord,
  insertSearch,
  listSearches,
  minSearchSortOrder,
  searchExists,
  swapSearchSortOrder,
  updateSearchColumns,
  type SearchColumn,
  type SearchRecord,
  type SearchValue,
} from '../db/repos/searches.js';
import { getLastScanSummary, getLatestAnalysis, getLatestScanStatus } from '../db/repos/scanRuns.js';
import { listFilterSourceRows, listListingParams } from '../db/repos/listings.js';
import type { CategoryOption, FilterOptions, LastScanResponse, ParamKeyInfo, ScanPlan } from '../types.js';

export const SEARCH_NOT_FOUND = 'Пошук не знайдено';

/** Тіло POST/PATCH /api/searches. */
export interface SearchInput {
  name?: string;
  query?: string;
  category_id?: number | null;
  api_filters?: unknown;
  local_filters?: unknown;
  cron_enabled?: number;
  /** Синоніми query (docs/plans/old/search-synonyms.md). */
  query_synonyms?: string[];
  /** Архів пошуку (docs/plans/old/archive-searches.md): 1 — в архіві. */
  archived?: number;
  /** Проект (docs/plans/old/projects.md): id проекту або null — «Без проекту». */
  project_id?: number | null;
}

/** api_filters/local_filters приймаємо як обʼєкт або рядок → зберігаємо як JSON-рядок. */
function toJsonText(value: unknown, fallback = '{}'): string {
  if (value == null) return fallback;
  if (typeof value === 'string') return value;
  return JSON.stringify(value);
}

export async function getSearch(id: number): Promise<SearchRecord> {
  const row = await getSearchRecord(id);
  if (!row) throw new NotFoundError(SEARCH_NOT_FOUND);
  return row;
}

/** 404, якщо пошуку немає (легкий запит лише по id). */
export async function assertSearchExists(id: number): Promise<void> {
  if (!(await searchExists(id))) throw new NotFoundError(SEARCH_NOT_FOUND);
}

/** Усі пошуки за ручним порядком. */
export const listAllSearches = listSearches;


export async function createSearch(input: SearchInput): Promise<SearchRecord> {
  const { name, query } = input;
  if (!name || !query) throw new BadRequestError('Поля name і query обовʼязкові');

  // Новий пошук з'являється згори списку.
  const sortOrder = ((await minSearchSortOrder()) ?? 0) - 1;
  const id = await insertSearch({
    name,
    query,
    categoryId: input.category_id ?? null,
    apiFilters: toJsonText(input.api_filters),
    localFilters: toJsonText(input.local_filters),
    cronEnabled: input.cron_enabled ?? 0,
    sortOrder,
    querySynonyms: toJsonText(input.query_synonyms, '[]'),
    archived: input.archived ? 1 : 0,
    projectId: input.project_id ?? null,
  });
  return (await getSearchRecord(id)) as SearchRecord;
}

/** Колонки до UPDATE з тіла PATCH (лише передані поля). */
function changedColumns(input: SearchInput): Partial<Record<SearchColumn, SearchValue>> {
  const cols: Partial<Record<SearchColumn, SearchValue>> = {};
  if (input.name != null) cols.name = input.name;
  if (input.query != null) cols.query = input.query;
  if (input.category_id !== undefined) cols.category_id = input.category_id;
  if (input.api_filters !== undefined) cols.api_filters = toJsonText(input.api_filters);
  if (input.local_filters !== undefined) cols.local_filters = toJsonText(input.local_filters);
  if (input.cron_enabled !== undefined) cols.cron_enabled = input.cron_enabled;
  if (input.query_synonyms !== undefined) cols.query_synonyms = toJsonText(input.query_synonyms, '[]');
  if (input.archived !== undefined) cols.archived = input.archived ? 1 : 0;
  if (input.project_id !== undefined) cols.project_id = input.project_id ?? null;
  return cols;
}

/**
 * Оновлення пошуку. Зміна local_filters → ретроактивний перерахунок filtered_out для всіх рядків пошуку
 * і автокатегорії (білий список категорій міг змінитись; збій автокатегорії не валить PATCH).
 */
export async function updateSearch(
  id: number,
  input: SearchInput,
): Promise<SearchRecord | (SearchRecord & { filtered_out_count: number })> {
  await getSearch(id);
  await updateSearchColumns(id, changedColumns(input));
  const search = (await getSearchRecord(id)) as SearchRecord;
  if (input.local_filters === undefined) return search;

  const { filtered_out_count } = await recomputeFilteredOut(id);

  let freshSearch = search;
  try {
    await refreshBaseCategory(id);
    freshSearch = (await getSearchRecord(id)) as SearchRecord;
  } catch (err) {
    logWarn('searches', 'base-category', err instanceof Error ? err.message : String(err), { searchId: id });
  }
  return { ...freshSearch, filtered_out_count };
}

export async function deleteSearch(id: number): Promise<{ deleted: true }> {
  await assertSearchExists(id);
  await deleteSearchCascade(id);
  await invalidateCorpus(id, 'delete');
  return { deleted: true };
}

/** Ручне сортування (стрілки ↑/↓): міняє sort_order із сусідом у межах групи-проекту. */
export async function moveSearch(id: number, direction: unknown): Promise<SearchRecord | undefined> {
  if (direction !== 'up' && direction !== 'down') {
    throw new BadRequestError('direction має бути "up" або "down"');
  }
  const current = await getSearchPosition(id);
  if (!current) throw new NotFoundError(SEARCH_NOT_FOUND);

  const neighbor = await findSearchNeighbor(current, direction);
  if (neighbor) await swapSearchSortOrder(current, neighbor);
  return getSearchRecord(id);
}

/** Статус останнього скану — для поллінгу прогресу глибокого скану. */
export async function getScanStatus(searchId: number): Promise<Record<string, unknown>> {
  const row = await getLatestScanStatus(searchId);
  if (!row) throw new NotFoundError('Сканів ще не було');
  return row;
}

/**
 * Останній збережений аналіз (kind='analyze') — для перегляду без повторного зондування
 * (docs/plans/old/deep-scan-stop-and-history.md). planValid — часова валідність (у межах TTL за
 * finished_at): true → звіт ще запускний (за потреби runDeepScanFromPlan перезондує);
 * false → аналіз протермінований, потрібен новий.
 */
export async function getLastAnalysis(
  searchId: number,
): Promise<{ plan: ScanPlan; analyzedAt: string | null; planValid: boolean }> {
  const row = await getLatestAnalysis(searchId);
  if (!row) throw new NotFoundError('Аналізів ще не було');

  let plan: ScanPlan;
  try {
    plan = JSON.parse(row.scan_plan) as ScanPlan;
  } catch {
    throw new NotFoundError('Збережений аналіз пошкоджено');
  }

  return {
    plan,
    analyzedAt: row.finished_at,
    // Валідність — часова (у межах TTL за finished_at), НЕ прив'язана до in-memory кешу:
    // звіт лишається запускним протягом TTL навіть після закриття діалогу/перезапуску
    // сервера (runDeepScanFromPlan за потреби перезондує).
    planValid: isAnalysisFresh(row.finished_at),
  };
}

/** Розподіл усіх ключів params пошуку (для дропдауна конструктора діапазонів): до 3 різних прикладів. */
export async function getParamKeys(searchId: number): Promise<ParamKeyInfo[]> {
  const rows = await listListingParams(searchId);

  const samplesByKey = new Map<string, string[]>();
  for (const row of rows) {
    let params: Record<string, string>;
    try {
      params = JSON.parse(row.params) as Record<string, string>;
    } catch {
      continue;
    }
    for (const [key, value] of Object.entries(params)) {
      if (!samplesByKey.has(key)) samplesByKey.set(key, []);
      const samples = samplesByKey.get(key) as string[];
      if (samples.length < 3 && !samples.includes(value)) samples.push(value);
    }
  }

  return Array.from(samplesByKey.entries())
    .map(([key, samples]) => ({ key, samples }))
    .sort((a, b) => a.key.localeCompare(b.key));
}

/**
 * Варіанти для фільтрів "Місто"/"Продавець"/"Плюси"/"Мінуси" (Drawer локальних фільтрів).
 * Плюси/мінуси — DISTINCT критерії з реальних рядків (враховує ручний едіт, не лише analysis_criteria).
 */
export async function getFilterOptions(searchId: number): Promise<FilterOptions> {
  // Один прохід по рядках пошуку замість 4 окремих сканів (city/seller/pros/cons) —
  // дедуп і парсинг bullet-тексту в JS (на Turso кожен скан = +N прочитаних рядків).
  const rows = await listFilterSourceRows(searchId);

  const citySet = new Set<string>();
  const sellerSet = new Set<string>();
  const prosSet = new Set<string>();
  const consSet = new Set<string>();
  for (const row of rows) {
    if (row.city) citySet.add(row.city);
    if (row.seller_name) sellerSet.add(row.seller_name);
    if (row.pros) parseBullets(row.pros).forEach((c) => prosSet.add(c));
    if (row.cons) parseBullets(row.cons).forEach((c) => consSet.add(c));
  }

  // Дерево категорій OLX — кешований facet з останнього скану (searches.category_facet).
  // Назви/ієрархія/OLX-лічильники готові; локальні лічильники накладає фронт із listings.
  const facet = await getCategoryFacet(searchId);
  let categories: CategoryOption[] = [];
  try {
    categories = facet ? (JSON.parse(facet) as CategoryOption[]) : [];
  } catch {
    categories = [];
  }

  return {
    cities: [...citySet].sort(),
    sellers: [...sellerSet].sort(),
    pros: [...prosSet].sort(),
    cons: [...consSet].sort(),
    categories,
  };
}

/**
 * Останній скан для панелі дій. Агрегати in_db/stale_count/verify_candidates НЕ рахуємо тут:
 * фронт виводить їх із уже завантаженого масиву listings, щоб не робити зайвий 408-рядковий
 * SUM(CASE…)-прохід на кожен вибір пошуку (Turso reads, docs/plans/old/turso-stats-clientside.md).
 */
export async function getSearchStats(searchId: number): Promise<LastScanResponse> {
  await assertSearchExists(searchId);
  return { last_scan: (await getLastScanSummary(searchId)) ?? null };
}
