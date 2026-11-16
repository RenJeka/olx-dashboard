import { db, dbGet } from '../db.js';

/**
 * Ручний порядок елементів списку (стрілки ↑/↓, «нове — згори») за колонкою `sort_order`: менше — вище.
 * Механізм не знає, що саме впорядковано; таблицю, групу й фільтр сусідів задає репозиторій сутності.
 */
export interface ManualOrderList {
  /** Таблиця з колонками `id` і `sort_order`. Лише константа коду, не ввід користувача. */
  table: string;
  /** Сусіди — лише елементи з тим самим значенням цієї колонки (NULL — окрема група). */
  groupColumn?: string;
  /** SQL-предикат без параметрів: хто з тієї ж групи може бути сусідом (напр. лише неархівні). */
  neighborFilter?: string;
}

export type Direction = 'up' | 'down';

type Position = { id: number; sort_order: number; grp?: unknown };

export function isDirection(value: unknown): value is Direction {
  return value === 'up' || value === 'down';
}

/** `sort_order` для нового елемента згори всього списку (мінімум по таблиці мінус 1; порожня — -1). */
export async function nextTopSortOrder(list: ManualOrderList): Promise<number> {
  const row = await dbGet<{ min: number | null }>(`SELECT MIN(sort_order) AS min FROM ${list.table}`);
  return (row?.min ?? 0) - 1;
}

/**
 * Міняє `sort_order` елемента з найближчим сусідом у напрямку `direction` (у межах групи й фільтра).
 * На краю списку нічого не змінює. `false` — елемента з таким `id` немає.
 */
export async function moveOneStep(list: ManualOrderList, id: number, direction: Direction): Promise<boolean> {
  const grp = list.groupColumn ? `, ${list.groupColumn} AS grp` : '';
  const current = await dbGet<Position>(`SELECT id, sort_order${grp} FROM ${list.table} WHERE id = ?`, [id]);
  if (!current) return false;

  const conditions = [direction === 'up' ? 'sort_order < ?' : 'sort_order > ?'];
  const args: (number | string | null)[] = [current.sort_order];
  if (list.neighborFilter) conditions.push(list.neighborFilter);
  if (list.groupColumn) {
    // IS — рівність, що вважає NULL = NULL (група «без групи»).
    conditions.push(`${list.groupColumn} IS ?`);
    args.push((current.grp ?? null) as number | string | null);
  }
  const neighbor = await dbGet<Position>(
    `SELECT id, sort_order FROM ${list.table} WHERE ${conditions.join(' AND ')}
       ORDER BY sort_order ${direction === 'up' ? 'DESC' : 'ASC'} LIMIT 1`,
    args,
  );
  if (!neighbor) return true;

  await db.batch(
    [
      { sql: `UPDATE ${list.table} SET sort_order = ? WHERE id = ?`, args: [neighbor.sort_order, current.id] },
      { sql: `UPDATE ${list.table} SET sort_order = ? WHERE id = ?`, args: [current.sort_order, neighbor.id] },
    ],
    'write',
  );
  return true;
}
