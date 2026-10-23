import { db, dbAll, dbGet, dbRun } from '../db.js';
import type { Project } from '../../types.js';

type Position = { id: number; sort_order: number };

export function listProjects(): Promise<Project[]> {
  return dbAll<Project>('SELECT * FROM projects ORDER BY sort_order ASC, created_at DESC, id DESC');
}

export function getProject(id: number): Promise<Project | undefined> {
  return dbGet<Project>('SELECT * FROM projects WHERE id = ?', [id]);
}

export async function projectExists(id: number): Promise<boolean> {
  return (await dbGet('SELECT id FROM projects WHERE id = ?', [id])) !== undefined;
}

export async function minProjectSortOrder(): Promise<number | null> {
  return (await dbGet<{ min: number | null }>('SELECT MIN(sort_order) AS min FROM projects'))?.min ?? null;
}

/** INSERT → id нового проекту. */
export async function insertProject(name: string, sortOrder: number): Promise<number> {
  const info = await dbRun('INSERT INTO projects (name, sort_order) VALUES (?, ?)', [name, sortOrder]);
  return Number(info.lastInsertRowid);
}

export async function renameProject(id: number, name: string): Promise<void> {
  await dbRun('UPDATE projects SET name = ? WHERE id = ?', [name, id]);
}

/** Видалення проекту: пошуки відв'язуються (project_id = NULL), не видаляються. */
export async function deleteProjectUnlinkSearches(id: number): Promise<void> {
  // Чисті записи (відв'язування + видалення) → batch у неявній транзакції.
  await db.batch(
    [
      { sql: 'UPDATE searches SET project_id = NULL WHERE project_id = ?', args: [id] },
      { sql: 'DELETE FROM projects WHERE id = ?', args: [id] },
    ],
    'write',
  );
}

export function getProjectPosition(id: number): Promise<Position | undefined> {
  return dbGet<Position>('SELECT id, sort_order FROM projects WHERE id = ?', [id]);
}

/** Сусід за ручним порядком. */
export function findProjectNeighbor(current: Position, direction: 'up' | 'down'): Promise<Position | undefined> {
  return dbGet<Position>(
    direction === 'up'
      ? 'SELECT id, sort_order FROM projects WHERE sort_order < ? ORDER BY sort_order DESC LIMIT 1'
      : 'SELECT id, sort_order FROM projects WHERE sort_order > ? ORDER BY sort_order ASC LIMIT 1',
    [current.sort_order],
  );
}

/** Обмін sort_order двох проектів одним batch. */
export async function swapProjectSortOrder(a: Position, b: Position): Promise<void> {
  await db.batch(
    [
      { sql: 'UPDATE projects SET sort_order = ? WHERE id = ?', args: [b.sort_order, a.id] },
      { sql: 'UPDATE projects SET sort_order = ? WHERE id = ?', args: [a.sort_order, b.id] },
    ],
    'write',
  );
}
