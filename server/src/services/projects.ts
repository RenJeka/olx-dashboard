import { BadRequestError, NotFoundError } from '../errors.js';
import {
  deleteProjectUnlinkSearches,
  getProject,
  insertProject,
  listProjects,
  projectExists,
  PROJECT_ORDER,
  renameProject,
} from '../db/repos/projects.js';
import { isDirection, moveOneStep, nextTopSortOrder } from '../db/repos/manualOrder.js';
import type { Project } from '../types.js';
import { SERVICE_ERRORS } from './constants.js';

const { PROJECT_NOT_FOUND } = SERVICE_ERRORS;

/** Усі проєкти за ручним порядком. */
export const listAllProjects = listProjects;

async function assertProjectExists(id: number): Promise<void> {
  if (!(await projectExists(id))) throw new NotFoundError(PROJECT_NOT_FOUND);
}

/** Новий проєкт з'являється згори списку. */
export async function createProject(rawName: string | undefined): Promise<Project | undefined> {
  const name = rawName?.trim();
  if (!name) throw new BadRequestError(SERVICE_ERRORS.PROJECT_NAME_REQUIRED);
  const sortOrder = await nextTopSortOrder(PROJECT_ORDER);
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
  if (!isDirection(direction)) throw new BadRequestError(SERVICE_ERRORS.BAD_DIRECTION);
  if (!(await moveOneStep(PROJECT_ORDER, id, direction))) throw new NotFoundError(PROJECT_NOT_FOUND);
  return getProject(id);
}
