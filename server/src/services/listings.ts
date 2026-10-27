import { BadRequestError, NotFoundError } from '../errors.js';
import { getCorpus, type TextCorpus } from '../cache/textCorpus.js';
import { getLogger } from '../logger.js';
import { descriptionPreview, matchesQuery, stripHtml } from '../analysis/text.js';
import {
  LISTING_SORTABLE,
  applyManualPatch,
  getLightRow,
  getListingDetails,
  listLightRows,
  listListingDetails,
  listTextChunk,
  listingExists,
  type LightRowRaw,
} from '../db/repos/listings.js';
import { LISTING_STATUSES, type ListingPatch } from '../types.js';

const LISTING_NOT_FOUND = 'Оголошення не знайдено';
const DESCRIPTION_PREVIEW_CHARS = 240;
/** Максимум id в одному запиті деталей (AI-майстер просить описи пакетом). */
const DETAILS_MAX_IDS = 500;
/** Корпус пошуку в описі читається з Turso порціями (кеш — cache/textCorpus.ts). */
const SEARCH_CHUNK = 1000;
const OLX_STATUS_OVERRIDES = ['active', 'inactive', 'removed'];

/** Ліниво: тести з `vi.mock('../logger.js')` без getLogger не падають на імпорті. */
const log = () => getLogger('cache');

/** `description_head` → `description_preview` + `has_description`. */
function toLightRow({ description_head, ...row }: LightRowRaw) {
  const description_preview = descriptionPreview(description_head, DESCRIPTION_PREVIEW_CHARS);
  return { ...row, description_preview, has_description: description_preview != null };
}

/** Легкі рядки таблиці; невідомий sort → first_seen_at, order — DESC, якщо не asc. */
export async function listListings(searchId: number, sort?: string, order?: string) {
  const sortColumn = LISTING_SORTABLE.has(sort ?? '') ? (sort as string) : 'first_seen_at';
  const direction = order?.toLowerCase() === 'asc' ? 'ASC' : 'DESC';
  return (await listLightRows(searchId, sortColumn, direction)).map(toLightRow);
}

/** Повний опис і галерея одного оголошення — на вимогу (підказка, діалог, галерея). */
export async function getDetails(id: number): Promise<Record<string, unknown>> {
  const row = await getListingDetails(id);
  if (!row) throw new NotFoundError(LISTING_NOT_FOUND);
  return row;
}

/** Те саме пакетом (крок перегляду AI-майстра) — лише рядки цього пошуку; нечислові id відкидаються. */
export async function getDetailsBatch(searchId: number, rawIds: unknown): Promise<Record<string, unknown>[]> {
  const ids = Array.isArray(rawIds) ? rawIds.map(Number).filter((n) => Number.isInteger(n)) : [];
  if (ids.length > DETAILS_MAX_IDS) throw new BadRequestError(`Забагато id (максимум ${DETAILS_MAX_IDS})`);
  if (ids.length === 0) return [];
  return listListingDetails(searchId, ids);
}

/** Назви й описи пошуку з Turso (порціями за id) — уже очищені від HTML і в нижньому регістрі. */
async function loadTextCorpus(searchId: number): Promise<TextCorpus> {
  const corpus: TextCorpus = { ids: [], titles: [], descriptions: [] };
  let lastId = 0;
  for (;;) {
    const chunk = await listTextChunk(searchId, lastId, SEARCH_CHUNK);
    for (const row of chunk) {
      corpus.ids.push(row.id);
      corpus.titles.push((row.title ?? '').toLowerCase());
      corpus.descriptions.push(stripHtml(row.description).toLowerCase());
    }
    const last = chunk.at(-1);
    if (!last || chunk.length < SEARCH_CHUNK) break;
    lastId = last.id;
  }
  return corpus;
}

/**
 * Пошук у назві та/або описі (булевий запит, як у таблиці) → id збігів. Опис не віддається
 * на клієнт, тож пошук в описі — тут, по закешованому корпусу пошуку.
 */
export async function searchListingIds(
  searchId: number,
  rawQuery: string | undefined,
  inTitle: boolean,
  inDescription: boolean,
): Promise<{ ids: number[] }> {
  const query = (rawQuery ?? '').trim();
  if (!query || (!inTitle && !inDescription)) return { ids: [] };

  const started = performance.now();
  const { corpus, source } = await getCorpus(searchId, () => loadTextCorpus(searchId));
  const ids: number[] = [];
  corpus.ids.forEach((id, i) => {
    const parts: string[] = [];
    if (inTitle) parts.push(corpus.titles[i] ?? '');
    if (inDescription) parts.push(corpus.descriptions[i] ?? '');
    if (matchesQuery(parts.join('\n'), query)) ids.push(id);
  });
  log().info({ searchId, source, ms: Math.round(performance.now() - started), matches: ids.length }, 'пошук в описі');
  return { ids };
}

/** Ручна зміна статусу/нотатки/плюсів-мінусів/AI-релевантності/активності → оновлений легкий рядок. */
export async function patchListing(id: number, patch: ListingPatch) {
  if (!(await listingExists(id))) throw new NotFoundError(LISTING_NOT_FOUND);

  const { status, olx_status } = patch;
  if (status !== undefined && !LISTING_STATUSES.includes(status)) {
    throw new BadRequestError(`Невідомий статус: ${status}`);
  }
  // Ручний override «Активності» — лише фіксований набір або null («невідоме»).
  if (olx_status !== undefined && olx_status !== null && !OLX_STATUS_OVERRIDES.includes(olx_status)) {
    throw new BadRequestError(`Невідоме значення olx_status: ${olx_status}`);
  }

  await applyManualPatch(id, patch);
  const updated = await getLightRow(id);
  return updated && toLightRow(updated);
}
