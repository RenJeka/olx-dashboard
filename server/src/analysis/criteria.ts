// Категорії критеріїв мінусів/плюсів (docs/plans/criteria-categories.md): формат searches.analysis_criteria,
// синоніми, перейменування пунктів в оголошеннях. Єдине джерело — не парсити analysis_criteria деінде.
import type { AnalysisMode, CriteriaConfig, CriterionGroup, LocalFilters } from '../types.js';
import { BULLET_PREFIX } from './constants.js';
import { parseBullets } from './text.js';

/** Згортання пробілів + trim (формулювання критерію). */
function cleanCriterion(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

/** Ключ порівняння формулювань: без регістру й зайвих пробілів. */
export function phraseKey(value: string): string {
  return cleanCriterion(value).toLowerCase();
}

/**
 * Нормалізація списку категорій режиму: рядок (старий формат) → `{name, aliases: [], enabled: true}`;
 * порожні й дублі назв відкидаються (перша перемагає); синонім, що збігається з будь-якою назвою чи вже
 * зайнятий іншою категорією, відкидається — кожне формулювання належить рівно одній категорії.
 */
export function normalizeGroups(input: unknown): CriterionGroup[] {
  if (!Array.isArray(input)) return [];
  const raw: CriterionGroup[] = [];
  for (const item of input) {
    if (typeof item === 'string') {
      raw.push({ name: cleanCriterion(item), aliases: [], enabled: true });
    } else if (item && typeof item === 'object' && typeof (item as { name?: unknown }).name === 'string') {
      const obj = item as { name: string; aliases?: unknown; enabled?: unknown };
      const aliases = Array.isArray(obj.aliases)
        ? obj.aliases.filter((a): a is string => typeof a === 'string').map(cleanCriterion)
        : [];
      raw.push({ name: cleanCriterion(obj.name), aliases, enabled: obj.enabled !== false });
    }
  }

  const names = new Set<string>();
  const groups = raw.filter((g) => {
    const key = phraseKey(g.name);
    if (!key || names.has(key)) return false;
    names.add(key);
    return true;
  });

  const taken = new Set(names);
  return groups.map((g) => ({
    ...g,
    aliases: g.aliases.filter((a) => {
      const key = phraseKey(a);
      if (!key || taken.has(key)) return false;
      taken.add(key);
      return true;
    }),
  }));
}

/** searches.analysis_criteria (JSON, старий або новий формат) → конфіг категорій. Битий JSON → порожній. */
export function parseCriteriaConfig(text: string | null | undefined): CriteriaConfig {
  try {
    const parsed = JSON.parse(text || '{}') as Partial<Record<AnalysisMode, unknown>>;
    return { cons: normalizeGroups(parsed.cons), pros: normalizeGroups(parsed.pros) };
  } catch {
    return { cons: [], pros: [] };
  }
}

export function serializeCriteriaConfig(config: CriteriaConfig): string {
  return JSON.stringify({ cons: config.cons, pros: config.pros });
}

/** Категорії, що йдуть в аналіз (позначка «в аналізі»). */
export function enabledGroups(config: CriteriaConfig, mode: AnalysisMode): CriterionGroup[] {
  return config[mode].filter((g) => g.enabled);
}

/** Мапа «формулювання (назва чи синонім, ключ phraseKey) → назва категорії». */
export function aliasMap(groups: CriterionGroup[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const g of groups) {
    map.set(phraseKey(g.name), g.name);
    for (const a of g.aliases) map.set(phraseKey(a), g.name);
  }
  return map;
}

/**
 * Пункти TEXT-поля pros/cons (`• a\\n• b`): збіг із `keys` → `to` (або видалити, коли `to = null`), без
 * дублів (перший лишається), порядок зберігається. Жодного збігу → текст повертається як є (null-safe).
 */
export function remapBullets(text: string | null, keys: Set<string>, to: string | null): string | null {
  const items = parseBullets(text);
  if (!items.some((i) => keys.has(phraseKey(i)))) return text;
  return remapList(items, keys, to)
    .map((i) => `${BULLET_PREFIX}${i}`)
    .join('\n');
}

/** Те саме для масиву рядків (local_filters.cons/pros). */
function remapList(items: string[], keys: Set<string>, to: string | null): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of items) {
    const next = keys.has(phraseKey(item)) ? to : item;
    if (next === null) continue;
    const key = phraseKey(next);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(next);
  }
  return out;
}

export interface RemapPlan {
  /** Новий список категорій режиму. */
  groups: CriterionGroup[];
  /** Формулювання (ключі phraseKey), які в оголошеннях і фільтрах стають `to` або видаляються. */
  keys: Set<string>;
}

/**
 * Об'єднати / перейменувати (`to` — назва категорії) або видалити (`to = null`) формулювання `from`
 * (назви категорій або пункти, що є лише в оголошеннях). Об'єднання: категорія `to` (нова або наявна)
 * забирає назви й синоніми обраних категорій як свої синоніми; стара назва лишається синонімом, щоб нові
 * генерації її поглинали. Видалення: категорії зникають разом із синонімами.
 */
export function planRemap(groups: CriterionGroup[], from: string[], to: string | null): RemapPlan {
  const fromKeys = new Set(from.map(phraseKey).filter(Boolean));
  const target = to === null ? null : cleanCriterion(to);
  const targetKey = target === null ? null : phraseKey(target);

  const matched = groups.filter((g) => fromKeys.has(phraseKey(g.name)));
  const keys = new Set<string>(fromKeys);
  for (const g of matched) {
    keys.add(phraseKey(g.name));
    g.aliases.forEach((a) => keys.add(phraseKey(a)));
  }

  if (target === null || targetKey === null) {
    const rest = groups.filter((g) => !matched.includes(g));
    return { groups: rest, keys };
  }

  const existing = groups.find((g) => phraseKey(g.name) === targetKey);
  // Наявна ціль — першою: її синоніми лишаються на початку списку.
  const sources = existing ? [existing, ...matched.filter((g) => g !== existing)] : matched;
  // Синоніми з'єднаної категорії: усі формулювання, крім самої назви; плюс наявні синоніми цілі.
  const aliasSeen = new Set<string>([targetKey]);
  const aliases: string[] = [];
  const addAlias = (value: string) => {
    const key = phraseKey(value);
    if (!key || aliasSeen.has(key)) return;
    aliasSeen.add(key);
    aliases.push(cleanCriterion(value));
  };
  for (const g of sources) {
    addAlias(g.name);
    g.aliases.forEach(addAlias);
  }
  from.forEach(addAlias);

  const merged: CriterionGroup = {
    name: target,
    aliases,
    enabled: sources.length === 0 || sources.some((g) => g.enabled),
  };
  // Ціль займає місце першої зачепленої категорії; формулювання з'єднаної прибираються з інших.
  const firstIndex = groups.findIndex((g) => sources.includes(g));
  const out: CriterionGroup[] = [];
  groups.forEach((g, i) => {
    if (i === firstIndex) out.push(merged);
    if (sources.includes(g)) return;
    out.push({ ...g, aliases: g.aliases.filter((a) => !aliasSeen.has(phraseKey(a))) });
  });
  if (firstIndex === -1) out.push(merged);
  // Ціль теж у ключах: пункти з іншим регістром/пробілами зводяться до точної назви.
  keys.add(targetKey);
  aliases.forEach((a) => keys.add(phraseKey(a)));
  return { groups: normalizeGroups(out), keys };
}

/** local_filters з перейменованими/видаленими пунктами режиму; порожній список прибирає правило. */
export function remapLocalFilters(
  filters: LocalFilters,
  mode: AnalysisMode,
  keys: Set<string>,
  to: string | null,
): LocalFilters {
  const list = filters[mode];
  if (!Array.isArray(list) || !list.some((i) => keys.has(phraseKey(i)))) return filters;
  const next: LocalFilters = { ...filters };
  const remapped = remapList(list, keys, to);
  if (remapped.length > 0) {
    next[mode] = remapped;
  } else {
    delete next[mode];
    if (next.invert) {
      const invert = { ...next.invert };
      delete invert[mode];
      next.invert = invert;
    }
  }
  return next;
}
