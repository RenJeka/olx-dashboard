/**
 * Спільні кроки remap критеріїв (об'єднати / перейменувати / видалити формулювання): розбір тіла запиту,
 * план по списку категорій і оновлення пунктів в оголошеннях та локальних фільтрах пошуку.
 * Використовують `POST /api/searches/:id/criteria/remap` і `POST /api/categories/:id/criteria/remap`.
 */
import type { InStatement } from '@libsql/client';
import { getSearchLocalFilters, listListingCriteria, listingCriteriaStatement } from '../db/repos/analysis.js';
import { parseLocalFilters } from '../scraper/localFilters.js';
import type { AnalysisMode, CriterionGroup, LocalFilters } from '../types.js';
import type { BaseDisabled } from './baseCriteria.js';
import { cleanCriterion, phraseKey, planRemap, remapBullets, remapLocalFilters } from './criteria.js';

/** Одне об'єднання/перейменування: формулювання `from` → `to` (null — видалити). */
export interface RemapOp {
  from: string[];
  to: string | null;
}

/** Крок remap після `planRemap`: ключі phraseKey, що стають `to` (або зникають, коли `to = null`). */
export interface RemapStep {
  keys: Set<string>;
  to: string | null;
}

/** Непорожні рядки з тіла запиту (формулювання критеріїв). */
export function phraseList(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string' && v.trim() !== '') : [];
}

/** Рядок із тіла запиту або null, якщо порожній чи не рядок. */
export function nonEmpty(value: unknown): string | null {
  return typeof value === 'string' && value.trim() !== '' ? value : null;
}

/**
 * Тіло remap (`{from, to}` або `{merges: [{from, to}]}`) → список операцій або текст помилки (400).
 * `merges` (автогрупування) мають `to`; одиночний `to: null` — видалення.
 */
export function parseRemapOps(body: { from?: unknown; to?: unknown; merges?: unknown }): RemapOp[] | { error: string } {
  if (body.merges !== undefined) {
    if (!Array.isArray(body.merges) || body.merges.length === 0) return { error: 'Не обрано жодної групи' };
    const ops = body.merges.map((m: unknown) => {
      const obj = (m && typeof m === 'object' ? m : {}) as { from?: unknown; to?: unknown };
      return { from: phraseList(obj.from), to: nonEmpty(obj.to) };
    });
    if (ops.some((op) => op.from.length === 0)) return { error: 'Не обрано жодного критерію' };
    if (ops.some((op) => op.to === null)) return { error: 'Порожня назва категорії' };
    return ops;
  }
  const from = phraseList(body.from);
  const to = nonEmpty(body.to);
  if (from.length === 0) return { error: 'Не обрано жодного критерію' };
  if (body.to !== null && to === null) return { error: 'Порожня назва категорії' };
  return [{ from, to }];
}

/**
 * Вимкнені базові пункти режиму після кроків remap: збіг із `keys` → `to` (або прибрати, коли `to = null`),
 * без дублів за phraseKey. Нічого не змінилось → той самий об'єкт (викликач порівнює посиланням).
 */
export function remapBaseDisabled(disabled: BaseDisabled, mode: AnalysisMode, steps: RemapStep[]): BaseDisabled {
  const list = disabled[mode];
  if (!list.some((name) => steps.some((step) => step.keys.has(phraseKey(name))))) return disabled;
  let items = list;
  for (const step of steps) {
    const seen = new Set<string>();
    items = items
      .map((name) => (step.keys.has(phraseKey(name)) ? step.to : name))
      .filter((name): name is string => {
        if (name === null) return false;
        const key = phraseKey(name);
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
  }
  return { ...disabled, [mode]: items };
}

/** Операції застосовуються по черзі до списку категорій; ті самі кроки йдуть до оголошень і фільтрів. */
export function planRemapSteps(
  groups: CriterionGroup[],
  ops: RemapOp[],
): { groups: CriterionGroup[]; steps: RemapStep[] } {
  const steps: RemapStep[] = [];
  let next = groups;
  for (const op of ops) {
    const plan = planRemap(next, op.from, op.to);
    next = plan.groups;
    steps.push({ keys: plan.keys, to: op.to });
  }
  return { groups: next, steps };
}

/**
 * Власні пункти пошуку після remap базового пункту категорії: пункт, назва якого збігається з `keys` кроку
 * перейменування/об'єднання, зливається в `to` разом із синонімами (planRemap; стан «в аналізі» зберігається) —
 * інакше він воскрес би під старою назвою, коли базовий зникне. Збіг лише синоніма перейменовує тільки цей синонім
 * (сам пункт може бути поглинутий іншим базовим); `to`, що вже є в іншому пункті, синонімом не дублюється.
 * Кроки видалення (`to = null`) власних пунктів не чіпають: пункт пошуку лишається (як і пункти в оголошеннях).
 * Нічого не змінилось → той самий масив.
 */
export function remapOwnGroups(groups: CriterionGroup[], steps: RemapStep[]): CriterionGroup[] {
  let next = groups;
  for (const step of steps) {
    if (step.to === null) continue;
    const from = next.filter((g) => step.keys.has(phraseKey(g.name))).map((g) => g.name);
    if (from.length > 0) next = planRemap(next, from, step.to).groups;
    next = renameAliases(next, step.keys, cleanCriterion(step.to));
  }
  return next;
}

/**
 * Синоніми зі `keys` → `target` (один раз на весь список, без дублів у пункті). Пункт із назвою `target` (щойно
 * злитий planRemap) не чіпається: стара назва лишається його синонімом. Без збігів → той самий масив.
 */
function renameAliases(groups: CriterionGroup[], keys: Set<string>, target: string): CriterionGroup[] {
  const targetKey = phraseKey(target);
  const isHit = (a: string) => keys.has(phraseKey(a)) && phraseKey(a) !== targetKey;
  const touches = (g: CriterionGroup) => phraseKey(g.name) !== targetKey && g.aliases.some(isHit);
  if (!groups.some(touches)) return groups;
  let targetTaken = groups.some((g) => [g.name, ...g.aliases].some((p) => phraseKey(p) === targetKey));
  return groups.map((g) => {
    if (!touches(g)) return g;
    const aliases: string[] = [];
    for (const a of g.aliases) {
      if (!isHit(a)) aliases.push(a);
      else if (!targetTaken) {
        aliases.push(target);
        targetTaken = true;
      }
    }
    return { ...g, aliases };
  });
}

/** Чи є у фільтрі правило режиму «мінуси/плюси» (тоді remap може змінити, кого ховає фільтр). */
export function filterActive(filters: LocalFilters, mode: AnalysisMode): boolean {
  return (filters[mode]?.length ?? 0) > 0;
}

/**
 * Пункти режиму в оголошеннях пошуку та його local_filters після кроків remap. Читає лише оголошення пошуку
 * з непорожнім полем режиму; UPDATE-и — лише для рядків, де пункт справді є. `localFilters` — уже прочитані
 * фільтри (без них читаються тут). Фільтри не пишуться: `nextFilters` і `filtersChanged` — рішення викликача.
 */
export async function remapListingStatements(
  searchId: number,
  mode: AnalysisMode,
  steps: RemapStep[],
  localFilters?: LocalFilters,
): Promise<{ statements: InStatement[]; filtersChanged: boolean; nextFilters: LocalFilters }> {
  const filters = localFilters ?? parseLocalFilters(await getSearchLocalFilters(searchId));
  const nextFilters = steps.reduce((f, step) => remapLocalFilters(f, mode, step.keys, step.to), filters);

  const statements: InStatement[] = [];
  for (const row of await listListingCriteria(searchId, mode)) {
    const next = steps.reduce((text, step) => remapBullets(text, step.keys, step.to), row.val);
    if (next !== row.val) statements.push(listingCriteriaStatement(mode, row.id, next));
  }
  return { statements, filtersChanged: nextFilters !== filters, nextFilters };
}
