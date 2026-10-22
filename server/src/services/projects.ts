import { BadRequestError, NotFoundError } from '../errors.js';
import {
  deleteProjectUnlinkSearches,
  findProjectNeighbor,
  getProject,
  getProjectPosition,
  insertProject,
  listProjects,
  minProjectSortOrder,
  projectExists,
  renameProject,
  swapProjectSortOrder,
} from '../db/repos/projects.js';
import type { Project } from '../types.js';

const PROJECT_NOT_FOUND = 'Проект не знайдено';

/** Усі проекти за ручним порядком. */
export const listAllProjects = listProjects;

async function assertProjectExists(id: number): Promise<void> {
  if (!(await projectExists(id))) throw new NotFoundError(PROJECT_NOT_FOUND);
}

/** Новий проект з'являється згори списку. */
export async function createProject(rawName: string | undefined): Promise<Project | undefined> {
  const name = rawName?.trim();
  if (!name) throw new BadRequestError('Поле name обовʼязкове');
  const sortOrder = ((await minProjectSortOrder()) ?? 0) - 1;
  return getProject(await insertProject(name, sortOrder));
}

/** Перейменування; порожня назва — без змін. */
export async function updateProject(id: number, rawName: string | undefined): Promise<Project | undefined> {
  await assertProjectExists(id);
  const name = rawName?.trim();
  if (name) await renameProject(id, name);
  return getProject(id);
}

/** Видалення: відв'язуємо пошуки (project_id = NULL), пошуки НЕ видаляємо. */
export async function deleteProject(id: number): Promise<{ deleted: true }> {
  await assertProjectExists(id);
  await deleteProjectUnlinkSearches(id);
  return { deleted: true };
}

/** Ручне сортування (стрілки ↑/↓): міняє sort_order із сусідом за поточним порядком. */
export async function moveProject(id: number, direction: unknown): Promise<Project | undefined> {
  if (direction !== 'up' && direction !== 'down') {
    throw new BadRequestError('direction має бути "up" або "down"');
  }
  const current = await getProjectPosition(id);
  if (!current) throw new NotFoundError(PROJECT_NOT_FOUND);

  const neighbor = await findProjectNeighbor(current, direction);
  if (neighbor) await swapProjectSortOrder(current, neighbor);
  return getProject(id);
}
