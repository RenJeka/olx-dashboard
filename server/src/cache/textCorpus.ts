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

/** `shared` — запит дочекався побудови, яку вже почав паралельний запит того самого пошуку. */
export type CorpusSource = 'L1' | 'L2' | 'turso' | 'shared';

interface L1Entry {
  /** Локальний лічильник на момент побудови — скидання в цьому процесі робить запис застарілим. */
  localGen: number;
  /** Версія з Redis на момент побудови (null — Redis не було). */
  remoteVersion: number | null;
  corpus: TextCorpus;
  /** Символів у назвах і описах — дешева оцінка розміру L1 (без серіалізації). */
  textChars: number;
}

const l1 = new Map<number, L1Entry>();
const localGens = new Map<number, number>();
/** Побудова/завантаження в процесі: паралельні запити пошуку чекають на неї, а не читають Turso вдруге. */
const inflight = new Map<number, Promise<{ corpus: TextCorpus; source: CorpusSource }>>();
/** Фонові записи в Redis (тести чекають на них через flushCacheWritesForTests). */
const pendingWrites = new Set<Promise<void>>();

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
  let l1Chars = 0;
  for (const entry of l1.values()) l1Chars += entry.textChars;
  const { rss, heapUsed } = process.memoryUsage();
  return { l1Searches: l1.size, l1Chars, rss, heapUsed };
}

const countChars = (corpus: TextCorpus) =>
  corpus.titles.reduce((n, t) => n + t.length, 0) + corpus.descriptions.reduce((n, d) => n + d.length, 0);

/**
 * Серіалізувати, стиснути й записати корпус у Redis і залогувати, скільки він там займає і скільки
 * пам'яті Redis зайнято. Іде у фоні — відповідь на пошук не чекає на gzip і завантаження.
 */
async function writeL2(store: CacheStore, searchId: number, version: number, corpus: TextCorpus): Promise<void> {
  const key = blobKey(searchId);
  const started = performance.now();
  const json = JSON.stringify({ version, ...corpus });
  const rawBytes = Buffer.byteLength(json);
  const blob = await gzipAsync(json);
  try {
    await store.setBuffer(key, blob);
  } catch (err) {
    const message = errorText(err);
    const info = await store.info().catch(() => ({}));
    // OOM — Redis заповнений (без TTL політика volatile-lru не витісняє) — головне, що шукає тест.
    const stage = message.includes('OOM') ? 'redis-oom' : 'redis-write';
    logWarn('cache', stage, `Redis: ${message}`, { searchId, rawBytes, gzipBytes: blob.length, ...info });
    return;
  }
  const memoryUsage = await store.memoryUsage(key).catch(() => null);
  const info = await store.info().catch(() => ({}));
  log().info(
    { searchId, key, rawBytes, gzipBytes: blob.length, memoryUsage, writeMs: elapsed(started), ...info, ...store.traffic() },
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
    const entry = { localGen: 0, remoteVersion: version, corpus, textChars: countChars(corpus) };
    log().info(
      { searchId, source: 'L2', gzipBytes: blob.length, rawBytes: Buffer.byteLength(json), ms: elapsed(started), ...store.traffic() },
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
 * разі читає Turso, як без кешу. Паралельні запити того самого пошуку ділять одну побудову
 * (на проді пошук у процесі набору слав два запити — і корпус iphone будувався з Turso двічі).
 */
export async function getCorpus(
  searchId: number,
  load: () => Promise<TextCorpus>,
): Promise<{ corpus: TextCorpus; source: CorpusSource }> {
  const running = inflight.get(searchId);
  if (running) return { ...(await running), source: 'shared' };
  const job = resolveCorpus(searchId, load);
  inflight.set(searchId, job);
  try {
    return await job;
  } finally {
    if (inflight.get(searchId) === job) inflight.delete(searchId);
  }
}

async function resolveCorpus(
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
  // Скидання під час читання → localGen уже інший, і наступний запит перебудує корпус.
  l1.set(searchId, { localGen, remoteVersion, corpus, textChars: countChars(corpus) });
  log().info(
    { searchId, source: 'turso', rows: corpus.ids.length, loadMs: elapsed(started), ...memoryStats() },
    'корпус побудовано',
  );

  if (store && remoteVersion !== null) {
    const write = writeL2(store, searchId, remoteVersion, corpus)
      .catch((err: unknown) => logWarn('cache', 'redis-write', `Redis: ${errorText(err)}`, { searchId }))
      .finally(() => pendingWrites.delete(write));
    pendingWrites.add(write);
  }
  return { corpus, source: 'turso' };
}

/**
 * Скинути корпус пошуку (зміна оголошень або видалення пошуку): L1 — одразу, у Redis — нова версія
 * й видалення блоку. Ніколи не кидає.
 */
export async function invalidateCorpus(searchId: number, reason: 'upsert' | 'delete'): Promise<void> {
  localGens.set(searchId, (localGens.get(searchId) ?? 0) + 1);
  l1.delete(searchId);
  // Побудова, що вже йде, — зі старих даних: нові запити не повинні до неї приєднуватись.
  inflight.delete(searchId);
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
  inflight.clear();
}

/** Лише для тестів: дочекатися фонових записів у Redis. */
export async function flushCacheWritesForTests(): Promise<void> {
  await Promise.all([...pendingWrites]);
}
