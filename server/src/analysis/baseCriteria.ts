/**
 * Базові плюси/мінуси категорій (docs/plans/base-criteria.md): пошук успадковує набори (`base_criteria`) своєї
 * автокатегорії (`searches.base_category_id`) і всіх її предків; злиття з власними пунктами — під час читання.
 * Вимкнені пошуком базові пункти — `searches.base_disabled` (парс/серіалізація — лише тут).
 */
import { ancestorIds } from '../categories/tree.js';
import { dbAll, dbGet } from '../db/db.js';
import type { AnalysisMode, CategoryNode, CriteriaConfig, CriterionBase, CriterionGroup } from '../types.js';
import { cleanCriterion, normalizeGroups, parseCriteriaConfig, phraseKey } from './criteria.js';

const MODES: AnalysisMode[] = ['cons', 'pros'];

/** Межа глибини ланцюжка предків у рекурсивному CTE (захист від циклу в даних). */
export const MAX_CHAIN_DEPTH = 20;

/** Вимкнені пошуком базові пункти за режимом (назви; збіг — phraseKey з назвою чи синонімом). */
export type BaseDisabled = Record<AnalysisMode, string[]>;

/** Набір категорії-предка для злиття (від кореня до листа). */
export interface BaseSet {
  categoryId: number;
  label: string;
  config: CriteriaConfig;
}

/** Категорія пошуку для відповіді `GET …/criteria`: шлях — назви від кореня до листа. */
export interface EffectiveCategory {
  id: number;
  path: string[];
}

export interface EffectiveCriteria {
  config: CriteriaConfig;
  category: EffectiveCategory | null;
}

/** Поля рядка `searches`, потрібні для ефективних критеріїв. */
export interface SearchCriteriaRow {
  analysis_criteria: string | null;
  base_category_id: number | null;
  base_disabled: string | null;
}

const emptyDisabled = (): BaseDisabled => ({ cons: [], pros: [] });

/** `searches.base_disabled` (JSON) → вимкнення; битий/відсутній → порожньо. */
export function parseBaseDisabled(text: string | null | undefined): BaseDisabled {
  try {
    const parsed = JSON.parse(text || '{}') as Partial<Record<AnalysisMode, unknown>>;
    const list = (v: unknown) => (Array.isArray(v) ? v.filter((s): s is string => typeof s === 'string') : []);
    return { cons: list(parsed.cons), pros: list(parsed.pros) };
  } catch {
    return emptyDisabled();
  }
}

export function serializeBaseDisabled(disabled: BaseDisabled): string {
  return JSON.stringify({ cons: disabled.cons, pros: disabled.pros });
}

/**
 * Ефективний список: бази від кореня до листа, далі власні пункти. Вимкнені в довіднику пункти не успадковуються.
 * Збіг формулювань (назва чи синонім, phraseKey) → один пункт: перший (найближчий до кореня) базовий лишає свою
 * назву й `base`, синоніми об'єднуються, власний пункт поглинається. Базовий пункт, назва чи синонім якого є
 * в `disabled[mode]`, — `enabled: false`.
 */
export function mergeBaseCriteria(own: CriteriaConfig, bases: BaseSet[], disabled: BaseDisabled): CriteriaConfig {
  const out = { cons: [], pros: [] } as CriteriaConfig;
  for (const mode of MODES) {
    const items: CriterionGroup[] = [];
    const owner = new Map<string, CriterionGroup>();

    const add = (g: CriterionGroup, base: CriterionBase | null) => {
      const phrases = [g.name, ...g.aliases];
      const hit = phrases.map((p) => owner.get(phraseKey(p))).find((x) => x !== undefined);
      if (hit) {
        // Вимкнений власний пункт, поглинутий базовим, вимикає й базовий (наступний PUT перенесе це в base_disabled).
        if (!base && !g.enabled && hit.base) hit.enabled = false;
        // Поглинання: формулювання, яких ще ніхто не має, стають синонімами наявного пункту.
        for (const p of phrases) {
          const key = phraseKey(p);
          if (!key || owner.has(key)) continue;
          owner.set(key, hit);
          hit.aliases.push(p);
        }
        return;
      }
      const item: CriterionGroup = { name: g.name, aliases: [], enabled: base ? true : g.enabled };
      if (base) item.base = base;
      owner.set(phraseKey(g.name), item);
      for (const a of g.aliases) {
        const key = phraseKey(a);
        if (!key || owner.has(key)) continue;
        owner.set(key, item);
        item.aliases.push(a);
      }
      items.push(item);
    };

    for (const set of bases) {
      const base: CriterionBase = { categoryId: set.categoryId, label: set.label };
      for (const g of set.config[mode]) if (g.enabled) add(g, base);
    }
    for (const g of own[mode]) add(g, null);

    const off = new Set(disabled[mode].map(phraseKey));
    for (const item of items) {
      if (item.base && phrasesOf(item).some((p) => off.has(phraseKey(p)))) item.enabled = false;
    }
    out[mode] = items;
  }
  return out;
}

/** Назва й синоніми пункту. */
function phrasesOf(g: CriterionGroup): string[] {
  return [g.name, ...g.aliases];
}

/**
 * Список від клієнта (відлуння `GET …/criteria`) → власні пункти + вимкнення базових. Базовий пункт —
 * той, що має поле `base`; у `own` він не йде ніколи, вимкнений — його назва (очищена, без дублів за phraseKey)
 * потрапляє в `disabled[mode]`. Власні пункти нормалізуються (normalizeGroups; поле `base` не зберігається).
 * Режим, що не є масивом, — порожній.
 */
export function stripBaseCriteria(incoming: Record<AnalysisMode, unknown>): {
  own: CriteriaConfig;
  disabled: BaseDisabled;
} {
  const own = { cons: [], pros: [] } as CriteriaConfig;
  const disabled = emptyDisabled();
  for (const mode of MODES) {
    const value = incoming[mode];
    const list: unknown[] = Array.isArray(value) ? value : [];
    const mine: unknown[] = [];
    const seen = new Set<string>();
    for (const item of list) {
      if (!isBaseItem(item)) {
        mine.push(item);
        continue;
      }
      if (item.enabled !== false || typeof item.name !== 'string') continue;
      const name = cleanCriterion(item.name);
      const key = phraseKey(name);
      if (!key || seen.has(key)) continue;
      seen.add(key);
      disabled[mode].push(name);
    }
    own[mode] = normalizeGroups(mine);
  }
  return { own, disabled };
}

/**
 * Тіло PUT критеріїв (пошуку чи категорії): `{cons?, pros?}` невідомої форми → власні пункти + вимкнення
 * базових (stripBaseCriteria). Режим, що не є масивом (відсутній), лишає поточні значення.
 */
export function applyCriteriaBody(
  body: unknown,
  current: CriteriaConfig,
  currentDisabled: BaseDisabled = emptyDisabled(),
): { own: CriteriaConfig; disabled: BaseDisabled } {
  const obj = (body && typeof body === 'object' ? body : {}) as Partial<Record<AnalysisMode, unknown>>;
  const incoming = stripBaseCriteria({ cons: obj.cons, pros: obj.pros });
  const own = { cons: [], pros: [] } as CriteriaConfig;
  const disabled = emptyDisabled();
  for (const mode of MODES) {
    const sent = Array.isArray(obj[mode]);
    own[mode] = sent ? incoming.own[mode] : current[mode];
    disabled[mode] = sent ? incoming.disabled[mode] : currentDisabled[mode];
  }
  return { own, disabled };
}

/**
 * Власні пункти, поглинуті базовими (збіг формулювань), у злитому списку не видно, тож клієнт їх не відлунює.
 * Щоб вони не губились при PUT, збережені пункти, що перетинаються з формулюваннями базових, лишаються
 * (у кінці списку), якщо вхідний список уже не містить їхньої назви. Їхній стан «в аналізі» — стан базового
 * пункту, що їх поглинає (`disabled` — вимкнення після цього PUT): увімкнений базовий → `enabled: true` (інакше
 * вимкнений поглинутий пункт назавжди вимикав би базовий), вимкнений → `false` (щоб пункт, що знову стане
 * власним — базовий видалили чи змінилась автокатегорія, — не воскрес увімкненим).
 */
export function retainAbsorbedOwn(
  own: CriteriaConfig,
  stored: CriteriaConfig,
  bases: BaseSet[],
  disabled: BaseDisabled,
): CriteriaConfig {
  if (bases.length === 0) return own;
  const inherited = mergeBaseCriteria({ cons: [], pros: [] }, bases, disabled);
  const out = { cons: [], pros: [] } as CriteriaConfig;
  for (const mode of MODES) {
    // Формулювання (phraseKey) базового пункту → чи він увімкнений у пошуку.
    const baseEnabled = new Map<string, boolean>();
    for (const g of inherited[mode]) for (const p of phrasesOf(g)) baseEnabled.set(phraseKey(p), g.enabled);
    const present = new Set(own[mode].flatMap(phrasesOf).map(phraseKey));
    const kept: CriterionGroup[] = [];
    for (const g of stored[mode]) {
      if (present.has(phraseKey(g.name))) continue;
      const state = phrasesOf(g)
        .map((p) => baseEnabled.get(phraseKey(p)))
        .find((x) => x !== undefined);
      if (state !== undefined) kept.push({ ...g, enabled: state });
    }
    out[mode] = kept.length > 0 ? normalizeGroups([...own[mode], ...kept]) : own[mode];
  }
  return out;
}

function isBaseItem(item: unknown): item is { name?: unknown; enabled?: unknown; base: object } {
  if (!item || typeof item !== 'object') return false;
  const base = (item as { base?: unknown }).base;
  return base !== null && typeof base === 'object';
}

/**
 * Ланцюжок категорії від кореня до `id` включно (рекурсивний CTE — лише рядки ланцюжка, без читання всього
 * дерева; Turso-економія). Категорії немає в `olx_categories` → `[]`.
 */
export async function loadCategoryChain(id: number): Promise<CategoryNode[]> {
  const rows = await dbAll<{ id: number; parent_id: number | null; label: string; slug: string }>(
    `WITH RECURSIVE chain(id, parent_id, label, slug, depth) AS (
       SELECT id, parent_id, label, slug, 0 FROM olx_categories WHERE id = ?
       UNION ALL
       SELECT c.id, c.parent_id, c.label, c.slug, chain.depth + 1
         FROM olx_categories c JOIN chain ON c.id = chain.parent_id
        WHERE chain.depth < ?
     )
     SELECT id, parent_id, label, slug FROM chain`,
    [id, MAX_CHAIN_DEPTH],
  );
  if (rows.length === 0) return [];
  const nodes: CategoryNode[] = rows.map((r) => ({ id: r.id, parentId: r.parent_id, label: r.label, slug: r.slug }));
  const byId = new Map(nodes.map((n) => [n.id, n]));
  return ancestorIds(nodes, id)
    .map((x) => byId.get(x))
    .filter((n): n is CategoryNode => n !== undefined);
}

/** Набори `base_criteria` для вузлів ланцюжка — одним `SELECT … WHERE category_id IN (…)`, порядок ланцюжка. */
export async function loadBaseSets(chain: CategoryNode[]): Promise<BaseSet[]> {
  if (chain.length === 0) return [];
  const rows = await dbAll<{ category_id: number; criteria: string | null }>(
    `SELECT category_id, criteria FROM base_criteria WHERE category_id IN (${chain.map(() => '?').join(',')})`,
    chain.map((n) => n.id),
  );
  const byId = new Map(rows.map((r) => [r.category_id, r.criteria]));
  return chain
    .filter((n) => byId.has(n.id))
    .map((n) => ({ categoryId: n.id, label: n.label, config: parseCriteriaConfig(byId.get(n.id)) }));
}

/**
 * Базові набори автокатегорії пошуку: один read ланцюжка `olx_categories` + один read `base_criteria`.
 * Без автокатегорії або категорії немає в дереві → `bases: []`, `category: null` (без зайвих читань).
 */
export async function loadSearchBases(
  baseCategoryId: number | null | undefined,
): Promise<{ bases: BaseSet[]; category: EffectiveCategory | null }> {
  if (baseCategoryId === null || baseCategoryId === undefined) return { bases: [], category: null };
  const chain = await loadCategoryChain(baseCategoryId);
  if (chain.length === 0) return { bases: [], category: null };
  return { bases: await loadBaseSets(chain), category: { id: baseCategoryId, path: chain.map((n) => n.label) } };
}

/** Ефективні критерії вже прочитаного рядка пошуку (базові набори — loadSearchBases). */
export async function resolveEffectiveCriteria(search: SearchCriteriaRow): Promise<EffectiveCriteria> {
  const own = parseCriteriaConfig(search.analysis_criteria);
  const { bases, category } = await loadSearchBases(search.base_category_id);
  if (!category) return { config: own, category: null };
  return { config: mergeBaseCriteria(own, bases, parseBaseDisabled(search.base_disabled)), category };
}

/** Ефективні критерії пошуку за id (пошуку немає → порожньо, `category: null`). */
export async function getEffectiveCriteria(searchId: number): Promise<EffectiveCriteria> {
  const search = await dbGet<SearchCriteriaRow>(
    'SELECT analysis_criteria, base_category_id, base_disabled FROM searches WHERE id = ?',
    [searchId],
  );
  if (!search) return { config: { cons: [], pros: [] }, category: null };
  return resolveEffectiveCriteria(search);
}

/** Формулювання (phraseKey) базових пунктів ефективного списку режиму — назви й синоніми. */
export function baseKeys(config: CriteriaConfig, mode: AnalysisMode): Set<string> {
  const keys = new Set<string>();
  for (const g of config[mode]) {
    if (!g.base) continue;
    keys.add(phraseKey(g.name));
    g.aliases.forEach((a) => keys.add(phraseKey(a)));
  }
  return keys;
}
