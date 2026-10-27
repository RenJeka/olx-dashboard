/**
 * Кеш тексту пошуку для пошуку в описі (docs/plans/redis-description-search-cache.md, P-011).
 *
 * Корпус — назви й описи оголошень пошуку, вже очищені від HTML і в нижньому регістрі.
 * Два рівні:
 *  - L1 — пам'ять процесу: звичайні запити, без Turso і без трафіку до Redis;
 *  - L2 — Redis (gzip): переживає засинання/рестарт Render, щоб перший пошук не читав усе з Turso.
 * Актуальність — версія пошуку в Redis (`INCR` при кожному upsert оголошень і видаленні пошуку)
 * плюс локальний лічильник процесу. Назву й опис пише лише upsertListings, тож скидання — там.
 * Межі розміру навмисно немає (етап тесту): усе пишеться в логи `scope: "cache"`.
 */
import { promisify } from 'node:util';
import { gunzip, gzip } from 'node:zlib';
import { getLogger, logWarn } from '../logger.js';
import { getCacheStore, keyPrefix, type CacheStore } from './redis.js';

const gzipAsync = promisify(gzip);
const gunzipAsync = promisify(gunzip);

/** Ліниво: тести з `vi.mock('../logger.js')` без getLogger не падають на імпорті. */
const log = () => getLogger('cache');

/** Текст пошуку: паралельні масиви за індексом оголошення. */
export interface TextCorpus {
  ids: number[];
  titles: string[];
  descriptions: string[];
}

export type CorpusSource = 'L1' | 'L2' | 'turso';

interface L1Entry {
  /** Локальний лічильник на момент побудови — скидання в цьому процесі робить запис застарілим. */
  localGen: number;
  /** Версія з Redis на момент побудови (null — Redis не було). */
  remoteVersion: number | null;
  corpus: TextCorpus;
  rawBytes: number;
}

const l1 = new Map<number, L1Entry>();
const localGens = new Map<number, number>();

const versionKey = (searchId: number) => `${keyPrefix()}corpus:${searchId}:v`;
const blobKey = (searchId: number) => `${keyPrefix()}corpus:${searchId}`;
const errorText = (err: unknown) => (err instanceof Error ? err.message : String(err));
const elapsed = (from: number) => Math.round(performance.now() - from);

/** Redis-виклик, що не валить пошук: помилка → журнал і null. */
async function attempt<T>(stage: string, fn: () => Promise<T>, details: Record<string, unknown>): Promise<T | null> {
  try {
    return await fn();
  } catch (err) {
    logWarn('cache', stage, `Redis: ${errorText(err)}`, details);
    return null;
  }
}

/** Розмір L1 і пам'ять процесу — у кожен рядок логу про побудову/завантаження. */
function memoryStats() {
  let l1Bytes = 0;
  for (const entry of l1.values()) l1Bytes += entry.rawBytes;
  const { rss, heapUsed } = process.memoryUsage();
  return { l1Searches: l1.size, l1Bytes, rss, heapUsed };
}

/** Записати корпус у Redis і залогувати, скільки він там займає і скільки пам'яті Redis зайнято. */
async function writeL2(store: CacheStore, searchId: number, blob: Buffer): Promise<void> {
  const key = blobKey(searchId);
  try {
    await store.setBuffer(key, blob);
  } catch (err) {
    const message = errorText(err);
    const info = await store.info().catch(() => ({}));
    // OOM — Redis заповнений (без TTL політика volatile-lru не витісняє) — головне, що шукає тест.
    const stage = message.includes('OOM') ? 'redis-oom' : 'redis-write';
    logWarn('cache', stage, `Redis: ${message}`, { searchId, bytes: blob.length, ...info });
    return;
  }
  const memoryUsage = await store.memoryUsage(key).catch(() => null);
  const info = await store.info().catch(() => ({}));
  log().info(
    { searchId, key, bytes: blob.length, memoryUsage, ...info, ...store.traffic() },
    'корпус записано в Redis',
  );
}

async function readL2(store: CacheStore, searchId: number, version: number): Promise<L1Entry | null> {
  const started = performance.now();
  const blob = await attempt('redis-read', () => store.getBuffer(blobKey(searchId)), { searchId });
  if (!blob) return null;
  try {
    const json = (await gunzipAsync(blob)).toString('utf8');
    const parsed = JSON.parse(json) as TextCorpus & { version: number };
    if (parsed.version !== version) return null;
    const corpus = { ids: parsed.ids, titles: parsed.titles, descriptions: parsed.descriptions };
    const entry = { localGen: 0, remoteVersion: version, corpus, rawBytes: Buffer.byteLength(json) };
    log().info(
      { searchId, source: 'L2', gzipBytes: blob.length, rawBytes: entry.rawBytes, ms: elapsed(started), ...store.traffic() },
      'корпус узято з Redis',
    );
    return entry;
  } catch (err) {
    logWarn('cache', 'redis-decode', `Пошкоджений корпус у Redis: ${errorText(err)}`, { searchId });
    return null;
  }
}

/**
 * Корпус пошуку: L1 → L2 (Redis) → `load()` (Turso). Ніколи не падає через Redis — у гіршому
 * разі читає Turso, як без кешу.
 */
export async function getCorpus(
  searchId: number,
  load: () => Promise<TextCorpus>,
): Promise<{ corpus: TextCorpus; source: CorpusSource }> {
  const localGen = localGens.get(searchId) ?? 0;
  const store = await getCacheStore();
  const remoteVersion = store
    ? await attempt('redis-read', () => store.getNumber(versionKey(searchId)), { searchId })
    : null;

  const cached = l1.get(searchId);
  if (cached && cached.localGen === localGen && cached.remoteVersion === remoteVersion) {
    return { corpus: cached.corpus, source: 'L1' };
  }

  if (store && remoteVersion !== null) {
    const entry = await readL2(store, searchId, remoteVersion);
    if (entry) {
      l1.set(searchId, { ...entry, localGen });
      log().info({ searchId, ...memoryStats() }, 'L1 після завантаження з Redis');
      return { corpus: entry.corpus, source: 'L2' };
    }
  }

  const started = performance.now();
  const corpus = await load();
  const loadMs = elapsed(started);
  const json = JSON.stringify({ version: remoteVersion, ...corpus });
  const rawBytes = Buffer.byteLength(json);
  // Скидання під час читання → localGen уже інший, і наступний запит перебудує корпус.
  l1.set(searchId, { localGen, remoteVersion, corpus, rawBytes });

  let gzipBytes: number | null = null;
  if (store && remoteVersion !== null) {
    const blob = await gzipAsync(json);
    gzipBytes = blob.length;
    await writeL2(store, searchId, blob);
  }
  log().info(
    { searchId, source: 'turso', rows: corpus.ids.length, rawBytes, gzipBytes, loadMs, buildMs: elapsed(started), ...memoryStats() },
    'корпус побудовано',
  );
  return { corpus, source: 'turso' };
}

/**
 * Скинути корпус пошуку (зміна оголошень або видалення пошуку): L1 — одразу, у Redis — нова версія
 * й видалення блоку. Ніколи не кидає.
 */
export async function invalidateCorpus(searchId: number, reason: 'upsert' | 'delete'): Promise<void> {
  localGens.set(searchId, (localGens.get(searchId) ?? 0) + 1);
  l1.delete(searchId);
  const store = await getCacheStore();
  if (!store) return;
  const version = await attempt('redis-invalidate', () => store.incr(versionKey(searchId)), { searchId, reason });
  await attempt('redis-invalidate', () => store.del(blobKey(searchId)), { searchId, reason });
  log().info({ searchId, version, reason }, 'корпус скинуто');
}

/** Лише для тестів: очистити L1 (тести видаляють рядки напряму, без upsert). */
export function resetCorpusCacheForTests(): void {
  l1.clear();
  localGens.clear();
}
