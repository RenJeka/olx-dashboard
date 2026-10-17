/**
 * Спільні кроки remap критеріїв (об'єднати / перейменувати / видалити формулювання): розбір тіла запиту,
 * план по списку категорій і оновлення пунктів в оголошеннях та локальних фільтрах пошуку.
 * Використовують `POST /api/searches/:id/criteria/remap` і `POST /api/categories/:id/criteria/remap`.
 */
import type { InStatement } from '@libsql/client';
import { dbAll, dbGet } from '../db/db.js';
import type { AnalysisMode, CriterionGroup, LocalFilters } from '../types.js';
import type { BaseDisabled } from './baseCriteria.js';
import { phraseKey, planRemap, remapBullets, remapLocalFilters } from './criteria.js';

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

/** local_filters (JSON) → об'єкт; битий/порожній → `{}`. */
export function parseLocalFilters(text: string | null | undefined): LocalFilters {
  try {
    return JSON.parse(text || '{}') as LocalFilters;
  } catch {
    return {};
  }
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
  const filters =
    localFilters ??
    parseLocalFilters(
      (await dbGet<{ local_filters: string | null }>('SELECT local_filters FROM searches WHERE id = ?', [searchId]))
        ?.local_filters,
    );
  const nextFilters = steps.reduce((f, step) => remapLocalFilters(f, mode, step.keys, step.to), filters);

  const statements: InStatement[] = [];
  // mode — з whitelist (isMode): 'cons' | 'pros', безпечна інтерполяція.
  const rows = await dbAll<{ id: number; val: string | null }>(
    `SELECT id, ${mode} AS val FROM listings WHERE search_id = ? AND ${mode} <> ''`,
    [searchId],
  );
  for (const row of rows) {
    const next = steps.reduce((text, step) => remapBullets(text, step.keys, step.to), row.val);
    if (next !== row.val) {
      statements.push({ sql: `UPDATE listings SET ${mode} = ? WHERE id = ?`, args: [next, row.id] });
    }
  }
  return { statements, filtersChanged: nextFilters !== filters, nextFilters };
}
