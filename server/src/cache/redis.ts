/**
 * Клієнт Redis для кешу (docs/plans/redis-description-search-cache.md, P-011).
 *
 * Порожній `REDIS_URL` → кешу в Redis немає (`getCacheStore()` → null), працює лише пам'ять процесу.
 * Redis — best-effort: недоступність, таймаут чи OOM ніколи не валять запит — виклики повертають
 * помилку, а кеш-шар іде в Turso. Ключі мають префікс бази даних (хеш TURSO_DATABASE_URL), щоб
 * локальна розробка з тим самим Redis не змішувалась із продом.
 */
import { createHash } from 'node:crypto';
import { RESP_TYPES, createClient } from 'redis';
import { getLogger, logWarn } from '../logger.js';

/** Скільки чекати на одну команду, перш ніж піти в Turso. */
const COMMAND_TIMEOUT_MS = 3000;
/** Пауза перед новою спробою підключитися після невдачі (не смикати Redis на кожен пошук). */
const RECONNECT_COOLDOWN_MS = 60_000;

/** Ліниво: тести з `vi.mock('../logger.js')` без getLogger не падають на імпорті. */
const log = () => getLogger('cache');

/** Стан пам'яті Redis з `INFO` (поля можуть бути відсутні на керованому Redis Cloud). */
export interface RedisMemoryInfo {
  usedMemory?: number;
  maxmemory?: number;
  evictedKeys?: number;
  maxmemoryPolicy?: string;
}

/** Мінімальний інтерфейс сховища — для тестів підміняється фейком (setCacheStoreForTests). */
export interface CacheStore {
  getNumber(key: string): Promise<number>;
  incr(key: string): Promise<number>;
  getBuffer(key: string): Promise<Buffer | null>;
  setBuffer(key: string, value: Buffer): Promise<void>;
  del(key: string): Promise<void>;
  memoryUsage(key: string): Promise<number | null>;
  info(): Promise<RedisMemoryInfo>;
  /** Байти корисного навантаження від/до Redis з моменту старту процесу (оцінка трафіку). */
  traffic(): { sentBytes: number; receivedBytes: number };
}

/** Префікс ключів: окремий простір на кожну базу (прод Turso ≠ локальний файл). */
export function keyPrefix(): string {
  const dbId = process.env.TURSO_DATABASE_URL?.trim() || 'local';
  return `olx:${createHash('sha256').update(dbId).digest('hex').slice(0, 8)}:`;
}

function withTimeout<T>(promise: Promise<T>, what: string): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`Redis: таймаут ${COMMAND_TIMEOUT_MS} мс (${what})`)), COMMAND_TIMEOUT_MS);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

function parseInfo(text: string): Record<string, string> {
  const fields: Record<string, string> = {};
  for (const line of text.split(/\r?\n/)) {
    const i = line.indexOf(':');
    if (i > 0) fields[line.slice(0, i)] = line.slice(i + 1).trim();
  }
  return fields;
}

const toNumber = (v: string | undefined): number | undefined => (v === undefined || v === '' ? undefined : Number(v));

interface RedisConnection {
  store: CacheStore;
  connect: () => Promise<void>;
  destroy: () => void;
}

function createRedisStore(url: string): RedisConnection {
  const client = createClient({
    url,
    // Без черги офлайн-команд: поки з'єднання немає, команда одразу падає → пошук іде в Turso.
    disableOfflineQueue: true,
    socket: { connectTimeout: COMMAND_TIMEOUT_MS },
  });
  // Без обробника 'error' node-redis валить процес; самі помилки команд ловить кеш-шар.
  client.on('error', (err: Error) => log().warn({ err: err.message }, 'Redis: помилка з’єднання'));
  const binary = client.withTypeMapping({ [RESP_TYPES.BLOB_STRING]: Buffer });

  let sentBytes = 0;
  let receivedBytes = 0;

  const store: CacheStore = {
    async getNumber(key) {
      const v = await withTimeout(client.get(key), `GET ${key}`);
      receivedBytes += v?.length ?? 0;
      return v == null ? 0 : Number(v);
    },
    async incr(key) {
      return withTimeout(client.incr(key), `INCR ${key}`);
    },
    async getBuffer(key) {
      const v = (await withTimeout(binary.get(key), `GET ${key}`)) as Buffer | null;
      receivedBytes += v?.length ?? 0;
      return v;
    },
    async setBuffer(key, value) {
      sentBytes += value.length;
      await withTimeout(client.set(key, value), `SET ${key}`);
    },
    async del(key) {
      await withTimeout(client.del(key), `DEL ${key}`);
    },
    async memoryUsage(key) {
      return withTimeout(client.memoryUsage(key), `MEMORY USAGE ${key}`);
    },
    async info() {
      const memory = parseInfo(String(await withTimeout(client.info('memory'), 'INFO memory')));
      const stats = parseInfo(String(await withTimeout(client.info('stats'), 'INFO stats')));
      return {
        usedMemory: toNumber(memory.used_memory),
        maxmemory: toNumber(memory.maxmemory),
        maxmemoryPolicy: memory.maxmemory_policy,
        evictedKeys: toNumber(stats.evicted_keys),
      };
    },
    traffic: () => ({ sentBytes, receivedBytes }),
  };

  return {
    store,
    connect: async () => void (await withTimeout(client.connect(), 'connect')),
    // Зупиняє й фонові спроби перепідключення після невдалого старту.
    destroy: () => {
      if (client.isOpen) client.destroy();
    },
  };
}

let redis: RedisConnection | null = null;
let connected: Promise<boolean> | null = null;
let lastFailureAt = 0;
let testStore: CacheStore | null | undefined;

/**
 * Сховище Redis або null (немає `REDIS_URL` / не вдалося підключитися — нова спроба не частіше
 * RECONNECT_COOLDOWN_MS). Після першого підключення перепідключенням займається сам node-redis.
 */
export async function getCacheStore(): Promise<CacheStore | null> {
  if (testStore !== undefined) return testStore;
  const url = process.env.REDIS_URL?.trim();
  if (!url) return null;
  if (!connected) {
    if (Date.now() - lastFailureAt < RECONNECT_COOLDOWN_MS) return null;
    redis ??= createRedisStore(url);
    connected = redis.connect().then(
      () => {
        log().info('Redis: підключено');
        return true;
      },
      (err: unknown) => {
        logWarn('cache', 'redis-connect', `Redis недоступний: ${err instanceof Error ? err.message : String(err)}`);
        lastFailureAt = Date.now();
        connected = null;
        redis?.destroy();
        redis = null;
        return false;
      },
    );
  }
  return (await connected) ? redis!.store : null;
}

/** Лише для тестів: підмінити сховище (null — «Redis немає»; undefined — повернути справжнє). */
export function setCacheStoreForTests(store: CacheStore | null | undefined): void {
  testStore = store;
}
