/**
 * Use-cases remap критеріїв (об'єднати / перейменувати / видалити формулювання) без AI — для пошуку
 * (`POST /api/searches/:id/criteria/remap`) і базового набору категорії (`POST /api/categories/:id/criteria/remap`).
 * Спільні чисті кроки — `remap.ts`; SQL — `db/repos/`. Помилки — `HttpError` (код і текст відповіді).
 */
import type { InStatement } from '@libsql/client';
import { BadRequestError, NotFoundError } from '../errors.js';
import { applyStatements } from '../db/repos/batch.js';
import { getSearchCriteriaState, searchCriteriaStatement } from '../db/repos/analysis.js';
import { baseCriteriaStatement, listSubtreeSearches, searchColumnsStatement } from '../db/repos/categories.js';
import { parseLocalFilters } from '../scraper/localFilters.js';
import { recomputeFilteredOut } from '../scraper/refilter.js';
import type { CriteriaConfig } from '../types.js';
import {
  MAX_CHAIN_DEPTH,
  baseKeys,
  loadBaseSets,
  loadCategoryChain,
  loadSearchBases,
  mergeBaseCriteria,
  parseBaseDisabled,
  serializeBaseDisabled,
} from './baseCriteria.js';
import { ANALYSIS_ERRORS, isMode } from './constants.js';
import { parseCriteriaConfig, phraseKey, serializeCriteriaConfig } from './criteria.js';
import {
  filterActive,
  parseRemapOps,
  planRemapSteps,
  remapBaseDisabled,
  remapListingStatements,
  remapOwnGroups,
  type RemapOp,
} from './remap.js';

export const CATEGORY_NOT_FOUND = 'Категорію не знайдено';

/** Тіло remap: один `from → to` або `merges` (автогрупування). */
export interface RemapBody {
  mode?: string;
  from?: unknown;
  to?: unknown;
  merges?: unknown;
}

/** Режим і операції з тіла; невалідне → 400. */
function parseBody(body: RemapBody) {
  const mode = body.mode;
  if (!isMode(mode)) throw new BadRequestError(ANALYSIS_ERRORS.BAD_MODE);
  const ops = parseRemapOps(body);
  if ('error' in ops) throw new BadRequestError(ops.error);
  return { mode, ops: ops as RemapOp[] };
}

/**
 * Remap власних пунктів пошуку: категорії пошуку + пункти в оголошеннях і локальних фільтрах. Лише власні пункти:
 * формулювання базового пункту (назва чи синонім) у `from` → 400. `listings: false` (лише для видалення) — прибрати
 * зі списку, оголошення не чіпати. `merges` — кілька об'єднань одним проходом по оголошеннях і одним перерахунком
 * filtered_out. Відповідь — ефективний список (як GET).
 */
export async function remapSearchCriteria(
  id: number,
  body: RemapBody & { listings?: boolean },
): Promise<{ criteria: CriteriaConfig; updated: number; filtered_out_count: number | null }> {
  const { mode, ops } = parseBody(body);

  const search = await getSearchCriteriaState(id);
  if (!search) throw new NotFoundError(ANALYSIS_ERRORS.SEARCH_NOT_FOUND);
  // Базові набори читаються один раз: перевірка `from` і ефективний список у відповіді.
  const config = parseCriteriaConfig(search.analysis_criteria);
  const { bases } = await loadSearchBases(search.base_category_id);
  const disabled = parseBaseDisabled(search.base_disabled);
  const locked = baseKeys(mergeBaseCriteria(config, bases, disabled), mode);
  if (ops.some((op) => op.from.some((f) => locked.has(phraseKey(f))))) {
    throw new BadRequestError(ANALYSIS_ERRORS.BASE_ITEM_READONLY);
  }

  // Об'єднання застосовуються по черзі до списку категорій; ті самі кроки — до пунктів оголошень і фільтрів.
  const { groups, steps } = planRemapSteps(config[mode], ops);
  const nextConfig: CriteriaConfig = { ...config, [mode]: groups };
  const touchListings = ops.some((op) => op.to !== null) || body.listings !== false;

  const localFilters = parseLocalFilters(search.local_filters);
  let statements: InStatement[] = [];
  let nextFilters = localFilters;
  if (touchListings) {
    ({ statements, nextFilters } = await remapListingStatements(id, mode, steps, localFilters));
  }
  const updated = statements.length;
  // Пошук — останнім: після часткового збою чанків той самий remap повторюється з тим самим результатом.
  statements.push(searchCriteriaStatement(id, serializeCriteriaConfig(nextConfig), JSON.stringify(nextFilters)));
  await applyStatements(statements);

  // Об'єднання може змінити, кого ховає фільтр «мінуси/плюси» (було чи стало правило режиму) —
  // перерахувати приховані. Без такого правила перерахунок не потрібен (зайвий прохід по Turso).
  const { filtered_out_count } =
    touchListings && (filterActive(localFilters, mode) || filterActive(nextFilters, mode))
      ? await recomputeFilteredOut(id)
      : { filtered_out_count: null };
  return { criteria: mergeBaseCriteria(nextConfig, bases, disabled), updated, filtered_out_count };
}

/**
 * Remap власного пункту набору категорії. Пункти в оголошеннях і local_filters пошуків, чия автокатегорія — ця
 * категорія або її нащадок, переписуються тим самим планом; пошуки в предках не чіпаються. Вимкнення у
 * `base_disabled` цих пошуків теж; поглинуті базовим власні пункти (`analysis_criteria`) перейменовуються разом із
 * ним (remapOwnGroups). Видалення оголошень і власних пунктів не чіпає. Усі записи — одним батчем; набір категорії —
 * останнім.
 */
export async function remapCategoryCriteria(
  id: number,
  body: RemapBody,
): Promise<{ criteria: CriteriaConfig; updated: number; searches: number }> {
  const { mode, ops } = parseBody(body);

  const chain = await loadCategoryChain(id);
  if (chain.length === 0) throw new NotFoundError(CATEGORY_NOT_FOUND);
  const sets = await loadBaseSets(chain);
  const own: CriteriaConfig = sets.find((s) => s.categoryId === id)?.config ?? { cons: [], pros: [] };

  // `from` — лише власні пункти (назва чи синонім); пункт предка змінюється в самому предку.
  const ownKeys = new Set(own[mode].flatMap((g) => [g.name, ...g.aliases]).map(phraseKey));
  const inheritedKeys = baseKeys(
    mergeBaseCriteria({ cons: [], pros: [] }, sets.filter((s) => s.categoryId !== id), { cons: [], pros: [] }),
    mode,
  );
  for (const key of ops.flatMap((op) => op.from.map(phraseKey))) {
    if (ownKeys.has(key)) continue;
    throw new BadRequestError(
      inheritedKeys.has(key) ? ANALYSIS_ERRORS.BASE_ITEM_INHERITED : ANALYSIS_ERRORS.BASE_ITEM_UNKNOWN,
    );
  }

  // Синонім у `from` означає весь пункт: підміняємо його назвою пункту (planRemap збігає лише за назвою).
  const canonical = new Map<string, string>();
  for (const g of own[mode]) for (const p of [g.name, ...g.aliases]) canonical.set(phraseKey(p), g.name);
  const resolved = ops.map((op) => ({ ...op, from: op.from.map((f) => canonical.get(phraseKey(f)) ?? f) }));

  const { groups, steps } = planRemapSteps(own[mode], resolved);
  const nextOwn: CriteriaConfig = { ...own, [mode]: groups };
  const touchListings = ops.some((op) => op.to !== null);

  const statements: InStatement[] = [];
  const recompute: number[] = [];
  let updated = 0;
  let touchedSearches = 0;
  for (const search of await listSubtreeSearches(id, MAX_CHAIN_DEPTH)) {
    const filters = parseLocalFilters(search.local_filters);
    const disabled = parseBaseDisabled(search.base_disabled);
    const columns: Partial<Record<'local_filters' | 'base_disabled' | 'analysis_criteria', string>> = {};

    let rewritten = 0;
    let nextFilters = filters;
    if (touchListings) {
      const plan = await remapListingStatements(search.id, mode, steps, filters);
      statements.push(...plan.statements);
      rewritten = plan.statements.length;
      nextFilters = plan.nextFilters;
      if (plan.filtersChanged) columns.local_filters = JSON.stringify(nextFilters);
    }
    const nextDisabled = remapBaseDisabled(disabled, mode, steps);
    if (nextDisabled !== disabled && serializeBaseDisabled(nextDisabled) !== serializeBaseDisabled(disabled)) {
      columns.base_disabled = serializeBaseDisabled(nextDisabled);
    }
    const searchOwn = parseCriteriaConfig(search.analysis_criteria);
    const nextGroups = remapOwnGroups(searchOwn[mode], steps);
    if (nextGroups !== searchOwn[mode]) {
      const before = serializeCriteriaConfig(searchOwn);
      const after = serializeCriteriaConfig({ ...searchOwn, [mode]: nextGroups });
      if (after !== before) columns.analysis_criteria = after;
    }
    const searchUpdate = searchColumnsStatement(search.id, columns);
    if (searchUpdate) statements.push(searchUpdate);

    updated += rewritten;
    if (rewritten > 0) touchedSearches++;
    // Фільтр «мінуси/плюси» режиму міг змінити, кого ховає, — перерахувати лише тоді (зайвий прохід по Turso).
    const filterTouched = rewritten > 0 || nextFilters !== filters;
    if (filterTouched && (filterActive(filters, mode) || filterActive(nextFilters, mode))) recompute.push(search.id);
  }
  // Набір категорії — останнім: після часткового збою чанків той самий remap повторюється з тим самим результатом.
  statements.push(baseCriteriaStatement(id, serializeCriteriaConfig(nextOwn)));
  await applyStatements(statements);

  for (const searchId of recompute) await recomputeFilteredOut(searchId);
  return { criteria: nextOwn, updated, searches: touchedSearches };
}
