import { db, dbAll, dbGet, dbRun } from '../db.js';
import type { Project } from '../../types.js';
import type { ManualOrderList } from './manualOrder.js';

/** Ручний порядок проєктів: один список на всі проєкти. */
export const PROJECT_ORDER: ManualOrderList = { table: 'projects' };

export function listProjects(): Promise<Project[]> {
  return dbAll<Project>('SELECT * FROM projects ORDER BY sort_order ASC, created_at DESC, id DESC');
}

export function getProject(id: number): Promise<Project | undefined> {
  return dbGet<Project>('SELECT * FROM projects WHERE id = ?', [id]);
}

export async function projectExists(id: number): Promise<boolean> {
  return (await dbGet('SELECT id FROM projects WHERE id = ?', [id])) !== undefined;
}

/** INSERT → id нового проєкту. */
export async function insertProject(name: string, sortOrder: number): Promise<number> {
  const info = await dbRun('INSERT INTO projects (name, sort_order) VALUES (?, ?)', [name, sortOrder]);
  return Number(info.lastInsertRowid);
}

export async function renameProject(id: number, name: string): Promise<void> {
  await dbRun('UPDATE projects SET name = ? WHERE id = ?', [name, id]);
}

/** Видалення проєкту: пошуки відв'язуються (project_id = NULL), не видаляються. */
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
