/**
 * Словник категорій OLX: id листової категорії → читабельна назва + ланцюг предків.
 *
 * Per-listing GraphQL OLX повертає лише `category { id type }` (числовий id + грубий слаг) —
 * без назв і без дерева підкатегорій. Щоб показати «категорія → підкатегорія» з назвами,
 * один раз дотягуємо повне дерево категорій OLX і кешуємо локально.
 *
 * ⚠️ ЕНДПОЙНТ НЕ ВЕРИФІКОВАНО LIVE. Кандидат `https://www.olx.ua/api/v1/categories/` обрано як
 * найімовірніший публічний словник категорій, але в build-середовищі мережу до OLX заблоковано
 * (egress-allowlist), тож формат відповіді звірити НЕ вдалося. Парсер самоперевіряється
 * (`normalizeTree`) і за будь-якої невдачі повертає порожній словник — UI тоді показує id/слаг
 * замість назв (graceful fallback, без падіння). Формат звірити при першому живому запуску
 * (`docs/plans/category-counts-and-filter.md`, `docs/olx-api.md`).
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { USER_AGENT } from './constants.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
// server/data/olx-categories.json (olxCategories.ts лежить у server/src/scraper → на 2 рівні до server/)
const DATA_DIR = join(__dirname, '..', '..', 'data');
const CACHE_PATH = join(DATA_DIR, 'olx-categories.json');

/** Кандидат-ендпойнт словника категорій OLX (⚠️ потребує живої верифікації формату). */
const CATEGORIES_URL = 'https://www.olx.ua/api/v1/categories/';

/** Час життя кешу словника (1 доба) — категорії OLX змінюються рідко. */
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

/** Вузол словника: назва категорії та id батька (0/undefined — корінь). */
interface CategoryNode {
  name: string;
  parentId: number | null;
}

type CategoryMap = Map<number, CategoryNode>;

interface CacheFile {
  fetchedAt: number;
  /** Плаский запис id→{name,parentId}. */
  nodes: Record<string, CategoryNode>;
}

let memoryMap: CategoryMap | null = null;
let fetchAttempted = false;

/** Сирий елемент дерева категорій OLX (форма припущена — нормалізатор толерантний). */
interface RawCategory {
  id?: number | string;
  name?: string;
  parent_id?: number | string | null;
  parentId?: number | string | null;
  children?: RawCategory[];
}

function toNumber(value: unknown): number | null {
  if (value == null) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

/**
 * Рекурсивно розкладає (можливо вкладене) дерево категорій OLX у плаский Map.
 * Толерантний до форми: приймає і вкладені `children`, і плаский масив із `parent_id`.
 * Повертає null, якщо нічого валідного не розпарсилось (тригер fallback).
 */
function normalizeTree(raw: unknown): CategoryMap | null {
  const map: CategoryMap = new Map();

  const walk = (node: RawCategory, inheritedParent: number | null): void => {
    const id = toNumber(node.id);
    const name = typeof node.name === 'string' ? node.name.trim() : '';
    if (id != null && name) {
      const parentId = toNumber(node.parent_id ?? node.parentId) ?? inheritedParent;
      map.set(id, { name, parentId: parentId && parentId !== 0 ? parentId : null });
    }
    for (const child of node.children ?? []) walk(child, id ?? inheritedParent);
  };

  // OLX може загорнути дані у { data: [...] } або віддати масив напряму.
  const root = (raw as { data?: unknown })?.data ?? raw;
  if (Array.isArray(root)) {
    for (const item of root as RawCategory[]) walk(item, null);
  } else if (root && typeof root === 'object') {
    walk(root as RawCategory, null);
  }

  return map.size > 0 ? map : null;
}

function readCache(): CategoryMap | null {
  try {
    if (!existsSync(CACHE_PATH)) return null;
    const parsed = JSON.parse(readFileSync(CACHE_PATH, 'utf-8')) as CacheFile;
    if (Date.now() - (parsed.fetchedAt ?? 0) > CACHE_TTL_MS) return null;
    const map: CategoryMap = new Map();
    for (const [id, node] of Object.entries(parsed.nodes ?? {})) {
      map.set(Number(id), node);
    }
    return map.size > 0 ? map : null;
  } catch {
    return null;
  }
}

function writeCache(map: CategoryMap): void {
  try {
    mkdirSync(DATA_DIR, { recursive: true });
    const nodes: Record<string, CategoryNode> = {};
    for (const [id, node] of map) nodes[String(id)] = node;
    const payload: CacheFile = { fetchedAt: Date.now(), nodes };
    writeFileSync(CACHE_PATH, JSON.stringify(payload));
  } catch {
    // Кеш — лише оптимізація; невдача запису не критична.
  }
}

async function fetchDict(): Promise<CategoryMap | null> {
  try {
    const res = await fetch(CATEGORIES_URL, {
      headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return null;
    const json: unknown = await res.json();
    return normalizeTree(json);
  } catch {
    return null;
  }
}

/**
 * Повертає словник категорій (кеш-файл → пам'ять → одна спроба мережі за процес).
 * За будь-якої невдачі — порожній Map (UI падає на fallback id/слаг). Best-effort, не кидає.
 */
export async function getCategoryMap(): Promise<CategoryMap> {
  if (memoryMap) return memoryMap;

  const cached = readCache();
  if (cached) {
    memoryMap = cached;
    return cached;
  }

  // Лише одна мережева спроба на процес — не блокуємо кожен запит при недоступному OLX.
  if (!fetchAttempted) {
    fetchAttempted = true;
    const fetched = await fetchDict();
    if (fetched) {
      writeCache(fetched);
      memoryMap = fetched;
      return fetched;
    }
  }

  memoryMap = new Map();
  return memoryMap;
}

/**
 * Шлях назв від кореня до листової категорії `leafId`.
 * Якщо id немає у словнику — fallback `[fallbackLabel ?? String(leafId)]` (один сегмент).
 */
export function resolveCategoryPath(
  map: CategoryMap,
  leafId: number,
  fallbackLabel?: string,
): string[] {
  const node = map.get(leafId);
  if (!node) return [fallbackLabel?.trim() || String(leafId)];

  const path: string[] = [];
  const seen = new Set<number>();
  let currentId: number | null = leafId;
  while (currentId != null && !seen.has(currentId)) {
    seen.add(currentId);
    const current: CategoryNode | undefined = map.get(currentId);
    if (!current) break;
    path.unshift(current.name);
    currentId = current.parentId;
  }
  return path.length > 0 ? path : [fallbackLabel?.trim() || String(leafId)];
}
