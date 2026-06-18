import { db } from './db/db.js';
import { GraphqlOlxFetcher } from './scraper/graphqlOlxFetcher.js';
import { HtmlOlxFetcher } from './scraper/olxFetcher.js';
import { upsertListings } from './scraper/normalizer.js';
import { applyScanStatuses } from './scraper/statusEngine.js';
import { probeListingPage } from './scraper/verifier.js';
import type {
  SearchConfig,
  ScanResult,
  ApiFilters,
  RawListing,
  FetchOptions,
  VerifyResult,
} from './types.js';

const graphqlFetcher = new GraphqlOlxFetcher();
const htmlFetcher = new HtmlOlxFetcher();

/** Сторінок за один verify-прохід (P1+P2 разом) — той самий порядок, що DEEP_SAFETY_CAP. */
const VERIFY_PAGE_CAP = 50;
/** Розмір батчу — як у фетчерах (graphqlOlxFetcher.ts/olxFetcher.ts). */
const VERIFY_BATCH_SIZE = 3;
const VERIFY_MIN_DELAY_MS = 1000;
const VERIFY_MAX_DELAY_MS = 2000;
const VERIFY_BATCH_PAUSE_MIN_MS = 3000;
const VERIFY_BATCH_PAUSE_MAX_MS = 6000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function randomDelay(): number {
  return VERIFY_MIN_DELAY_MS + Math.floor(Math.random() * (VERIFY_MAX_DELAY_MS - VERIFY_MIN_DELAY_MS));
}

function batchPauseDelay(): number {
  return (
    VERIFY_BATCH_PAUSE_MIN_MS +
    Math.floor(Math.random() * (VERIFY_BATCH_PAUSE_MAX_MS - VERIFY_BATCH_PAUSE_MIN_MS))
  );
}

interface SearchRow {
  id: number;
  name: string;
  query: string;
  category_id: number | null;
  api_filters: string;
  query_synonyms: string;
}

function loadSearch(id: number): SearchConfig | null {
  const row = db
    .prepare('SELECT id, name, query, category_id, api_filters, query_synonyms FROM searches WHERE id = ?')
    .get(id) as SearchRow | undefined;

  if (!row) return null;

  let apiFilters: ApiFilters = {};
  try {
    apiFilters = JSON.parse(row.api_filters || '{}') as ApiFilters;
  } catch {
    apiFilters = {};
  }

  let querySynonyms: string[] = [];
  try {
    const parsed = JSON.parse(row.query_synonyms || '[]');
    if (Array.isArray(parsed)) querySynonyms = parsed.filter((v): v is string => typeof v === 'string');
  } catch {
    querySynonyms = [];
  }

  return {
    id: row.id,
    name: row.name,
    query: row.query,
    categoryId: row.category_id,
    apiFilters,
    querySynonyms,
  };
}

/** Дедуплікація варіантів query (case-insensitive), порожні відкидаються. */
function dedupeQueries(queries: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const q of queries) {
    const trimmed = q.trim();
    if (!trimmed) continue;
    const key = trimmed.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(trimmed);
  }
  return out;
}

/**
 * Викликає GraphqlOlxFetcher; якщо він кидає помилку — fallback на HtmlOlxFetcher.
 * Якщо впав і fallback — кидає об'єднану помилку (обидва методи недоступні).
 */
async function fetchWithFallback(
  search: SearchConfig,
  options?: FetchOptions,
): Promise<{
  raw: RawListing[];
  visibleTotalCount: number | null;
  note: string | null;
  requestsUsed: number;
  exhausted: boolean;
  usedGraphql: boolean;
  /** Частковий результат (warning фетчера, напр. «window cap hit») — покриття неповне. */
  partial: boolean;
  /** Кількість цінових бакетів split-скану (>1 — було розбиття); undefined для не-deep/HTML. */
  bucketsUsed?: number;
}> {
  try {
    // Глибокий скан — оркестратор із авто-розбиттям по ціні (docs/plans/price-range-split.md);
    // звичайний — один прохід. HTML-fallback не розбивається (немає visible_total_count).
    const onGraphqlProgress: FetchOptions['onProgress'] | undefined = options?.onProgress
      ? (d, t) => options.onProgress!(d, t, 'GraphQL')
      : undefined;
    const result = options?.deep
      ? await graphqlFetcher.fetchSearchSplit(search, { ...options, onProgress: onGraphqlProgress })
      : await graphqlFetcher.fetchSearch(search, { ...options, onProgress: onGraphqlProgress });
    return {
      raw: result.listings,
      visibleTotalCount: result.visibleTotalCount,
      note: result.warning ?? null,
      requestsUsed: result.requestsUsed,
      exhausted: result.exhausted,
      usedGraphql: true,
      partial: result.warning != null,
      bucketsUsed: result.bucketsUsed,
    };
  } catch (graphqlErr) {
    const graphqlMessage =
      graphqlErr instanceof Error ? graphqlErr.message : String(graphqlErr);

    try {
      const result = await htmlFetcher.fetchSearch(search, {
        ...options,
        onProgress: options?.onProgress ? (d, t) => options.onProgress!(d, t, 'HTML') : undefined,
      });
      const notes = [`graphql failed: ${graphqlMessage}; fallback html OK`];
      if (result.warning) notes.push(result.warning);
      return {
        raw: result.listings,
        visibleTotalCount: result.visibleTotalCount,
        note: notes.join('; '),
        requestsUsed: result.requestsUsed,
        exhausted: result.exhausted,
        usedGraphql: false,
        partial: result.warning != null,
      };
    } catch (htmlErr) {
      const htmlMessage = htmlErr instanceof Error ? htmlErr.message : String(htmlErr);
      throw new Error(
        `graphql failed: ${graphqlMessage}; html fallback failed: ${htmlMessage}`,
      );
    }
  }
}

/**
 * Сканує основний query + усі синоніми (docs/plans/search-synonyms.md), зливає видачі по
 * olxId. 1 query (без синонімів) — без змін поведінки, делегує fetchWithFallback напряму.
 * >1 query — завжди partial=true: union кількох незалежних видач не відсортований глобально
 * за last_refresh, тож вікно покриття statusEngine (CLAUDE.md) застосовувати небезпечно —
 * той самий принцип, що й у split-скані (graphqlOlxFetcher.fetchSearchSplit).
 */
async function fetchAllQueries(
  search: SearchConfig,
  options?: FetchOptions,
): ReturnType<typeof fetchWithFallback> {
  const variants = dedupeQueries([search.query, ...(search.querySynonyms ?? [])]);

  if (variants.length <= 1) {
    return fetchWithFallback(search, options);
  }

  const merged = new Map<number, RawListing>();
  let requestsUsed = 0;
  let usedGraphql = true;
  let allExhausted = true;
  let bucketsUsed = 0;
  const notes: string[] = [`multi-query: ${variants.length} варіантів запиту змерджено`];

  // Прогрес — кумулятивний офсет (точний total невідомий до завершення всіх варіантів,
  // але прогрес-бар лишається монотонним і орієнтовним).
  let doneOffset = 0;
  let totalOffset = 0;

  for (let vi = 0; vi < variants.length; vi++) {
    const variant = variants[vi] as string;
    const variantSearch: SearchConfig = { ...search, query: variant };
    const onVariantProgress: FetchOptions['onProgress'] | undefined = options?.onProgress
      ? (done, total, method) => options.onProgress!(doneOffset + done, totalOffset + total, method)
      : undefined;

    const result = await fetchWithFallback(variantSearch, { ...options, onProgress: onVariantProgress });

    for (const item of result.raw) merged.set(item.olxId, item);
    requestsUsed += result.requestsUsed;
    if (!result.usedGraphql) usedGraphql = false;
    if (!result.exhausted) allExhausted = false;
    if (result.bucketsUsed) bucketsUsed += result.bucketsUsed;
    if (result.note) notes.push(`«${variant}»: ${result.note}`);

    doneOffset += result.requestsUsed;
    totalOffset += Math.max(result.requestsUsed, 1);

    // Ввічливість між варіантами синонімів — як пауза між батчами глибокого скану.
    if (vi < variants.length - 1) {
      await sleep(batchPauseDelay());
    }
  }

  notes.push('вікно покриття пропущено (union кількох видач)');

  return {
    raw: [...merged.values()],
    // Об'єднана видача кількох незалежних запитів — visible_total_count окремого
    // запиту тут не репрезентативний (перетин/розбіжність неконтрольована).
    visibleTotalCount: null,
    note: notes.join('; '),
    requestsUsed,
    exhausted: allExhausted,
    usedGraphql,
    partial: true,
    bucketsUsed: bucketsUsed > 0 ? bucketsUsed : undefined,
  };
}

/**
 * Запускає сканування пошуку: fetcher (GraphQL → HTML fallback) → normalizer → запис scan_run.
 * Помилки скрейпінгу пишуться у scan_runs.error і прокидаються нагору
 * (роут мапить на 500), процес НЕ валиться.
 *
 * `options.deep` — глибокий скан (батчі з паузами 3–6с, до min(50, ceil(visible_total_count/40))
 * запитів). Прогрес пишеться у scan_runs.requests_done/requests_total через onProgress —
 * фронтенд поллить GET /api/searches/:id/scan-status.
 */
export async function runScan(searchId: number, options?: { deep?: boolean }): Promise<ScanResult> {
  const search = loadSearch(searchId);
  if (!search) {
    throw new Error(`Search ${searchId} не знайдено`);
  }

  const kind = options?.deep ? 'deep' : 'normal';

  const runId = Number(
    db
      .prepare('INSERT INTO scan_runs (search_id, started_at, kind) VALUES (?, ?, ?)')
      .run(searchId, new Date().toISOString(), kind).lastInsertRowid,
  );

  const onProgress = (done: number, total: number, method?: string): void => {
    if (method) {
      db.prepare('UPDATE scan_runs SET requests_done = ?, requests_total = ?, fetch_method = ? WHERE id = ?').run(
        done,
        total,
        method,
        runId,
      );
    } else {
      db.prepare('UPDATE scan_runs SET requests_done = ?, requests_total = ? WHERE id = ?').run(
        done,
        total,
        runId,
      );
    }
  };

  try {
    const { raw, visibleTotalCount, note, requestsUsed, exhausted, usedGraphql, partial, bucketsUsed } =
      await fetchAllQueries(search, {
        deep: options?.deep,
        onProgress,
      });
    const upsertResult = upsertListings(searchId, raw);

    // Вікно покриття (CLAUDE.md): лише для ПОВНИХ успішних GraphQL-сканів — не fallback,
    // не часткових (частковий deep із «window cap hit») і НЕ split (union кількох діапазонів
    // не відсортований глобально за refresh — вісь windowFloor невалідна). Усі три випадки
    // ставлять warning → partial=true → coverage пропускається.
    const { disabled_count } = usedGraphql && !partial
      ? applyScanStatuses(searchId, raw, exhausted)
      : { disabled_count: 0 };

    const result: ScanResult = { ...upsertResult, requestsUsed, disabled_count, bucketsUsed };

    if (visibleTotalCount != null) {
      db.prepare('UPDATE searches SET visible_total_count = ? WHERE id = ?').run(
        visibleTotalCount,
        searchId,
      );
    }

    db.prepare(
      'UPDATE scan_runs SET finished_at = ?, found = ?, new_count = ?, disabled_count = ?, error = ? WHERE id = ?',
    ).run(
      new Date().toISOString(),
      result.found,
      result.new_count,
      result.disabled_count,
      note,
      runId,
    );

    return result;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    db.prepare(
      'UPDATE scan_runs SET finished_at = ?, error = ? WHERE id = ?',
    ).run(new Date().toISOString(), message, runId);
    throw err;
  }
}

interface VerifyCandidateRow {
  id: number;
  olx_id: number;
  url: string;
  status: string;
  status_source: string;
  note: string;
  description: string | null;
  seller_name: string | null;
}

// P1 (живість): давно не бачені auto-рядки або manual-rejected — включно зі status='disabled'
// (auto), щоб дати шанс на реактивацію. ORDER BY last_seen_at ASC — найдавніші спершу.
const P1_CONDITION = `
  url IS NOT NULL
  AND last_seen_at < datetime('now', '-3 days')
  AND (status_source = 'auto' OR status = 'rejected')
`;

// P2 (дозаповнення): рядки без опису, що ще активні — не в P1 (NOT (P1_CONDITION)).
// ORDER BY posted_at DESC — свіжі цінніші.
const P2_CONDITION = `
  url IS NOT NULL
  AND description IS NULL
  AND status != 'disabled'
  AND NOT (${P1_CONDITION})
`;

/**
 * Кандидати verify-проходу (≤ cap, P1 спершу). Реалізація — `docs/plans/verify-pass.md` групи B1.
 */
function loadVerifyCandidates(searchId: number, cap: number): VerifyCandidateRow[] {
  const columns = 'id, olx_id, url, status, status_source, note, description, seller_name';

  const p1 = db
    .prepare(
      `SELECT ${columns} FROM listings WHERE search_id = ? AND ${P1_CONDITION} ORDER BY last_seen_at ASC LIMIT ?`,
    )
    .all(searchId, cap) as VerifyCandidateRow[];

  if (p1.length >= cap) return p1;

  const p2 = db
    .prepare(
      `SELECT ${columns} FROM listings WHERE search_id = ? AND ${P2_CONDITION} ORDER BY posted_at DESC LIMIT ?`,
    )
    .all(searchId, cap - p1.length) as VerifyCandidateRow[];

  return [...p1, ...p2];
}

/** Загальна кількість кандидатів verify-проходу (P1+P2, без перетину) — для /stats. */
export function countVerifyCandidates(searchId: number): number {
  const { cnt: p1 } = db
    .prepare(`SELECT COUNT(*) AS cnt FROM listings WHERE search_id = ? AND ${P1_CONDITION}`)
    .get(searchId) as { cnt: number };

  const { cnt: p2 } = db
    .prepare(`SELECT COUNT(*) AS cnt FROM listings WHERE search_id = ? AND ${P2_CONDITION}`)
    .get(searchId) as { cnt: number };

  return p1 + p2;
}

/** Дописує marker у note, якщо його ще немає (ідемпотентність — патерн normalizer.ts). */
function appendVerifyNote(note: string, marker: string): string {
  if (note.includes(marker)) return note;
  return note === '' ? marker : `${note}\n${marker}`;
}

const updateDeadStmt = db.prepare(`UPDATE listings SET status = 'disabled', note = ? WHERE id = ?`);

const updateAliveStmt = db.prepare(`
  UPDATE listings SET
    last_seen_at = datetime('now'),
    miss_count = 0,
    status = @status,
    description = COALESCE(description, @description),
    seller_name = COALESCE(seller_name, @seller_name)
  WHERE id = @id
`);

/**
 * Verify-прохід (Етап 2 A3, `docs/plans/verify-pass.md`): пряма перевірка сторінок
 * оголошень — живість (P1, давно не бачені) + дозаповнення description/seller_name
 * для рядків за межами вікна пагінації GraphQL (P2). До VERIFY_PAGE_CAP сторінок,
 * батчі по VERIFY_BATCH_SIZE з паузами (як глибокий скан). Прогрес — через
 * scan_runs.requests_done/requests_total (поллінг GET /scan-status).
 *
 * Маркери (docs/olx-api.md §3.4, верифіковано live 2026-06-12): 404|410 → dead;
 * 200 + `ad_description` → alive; інше → unknown (статус не змінюється).
 */
export async function runVerify(searchId: number): Promise<VerifyResult> {
  const search = db.prepare('SELECT id FROM searches WHERE id = ?').get(searchId);
  if (!search) {
    throw new Error(`Search ${searchId} не знайдено`);
  }

  const runId = Number(
    db
      .prepare('INSERT INTO scan_runs (search_id, started_at, kind) VALUES (?, ?, ?)')
      .run(searchId, new Date().toISOString(), 'verify').lastInsertRowid,
  );

  const candidates = loadVerifyCandidates(searchId, VERIFY_PAGE_CAP);
  const total = candidates.length;
  db.prepare('UPDATE scan_runs SET requests_done = 0, requests_total = ? WHERE id = ?').run(
    total,
    runId,
  );

  const result: VerifyResult = {
    checked: 0,
    alive: 0,
    dead: 0,
    unknown: 0,
    reactivated: 0,
    disabled_count: 0,
    backfilled: 0,
  };
  const unknownIssues: string[] = [];

  try {
    for (let i = 0; i < candidates.length; i++) {
      const candidate = candidates[i] as VerifyCandidateRow;
      const probe = await probeListingPage(candidate.url);
      result.checked++;

      if (probe.verdict === 'dead') {
        result.dead++;
        if (candidate.status_source === 'auto' || candidate.status === 'rejected') {
          const marker = `auto-disabled: verify http=${probe.httpStatus}`;
          updateDeadStmt.run(appendVerifyNote(candidate.note, marker), candidate.id);
          result.disabled_count++;
        }
      } else if (probe.verdict === 'alive') {
        result.alive++;
        const reactivate = candidate.status === 'disabled' && candidate.status_source === 'auto';
        if (reactivate) result.reactivated++;

        const backfillsDescription = candidate.description == null && probe.description != null;
        const backfillsSeller = candidate.seller_name == null && probe.sellerName != null;
        if (backfillsDescription || backfillsSeller) result.backfilled++;

        updateAliveStmt.run({
          id: candidate.id,
          status: reactivate ? 'new' : candidate.status,
          description: probe.description,
          seller_name: probe.sellerName,
        });
      } else {
        result.unknown++;
        unknownIssues.push(
          `#${candidate.olx_id}: ${probe.httpStatus == null ? 'мережева помилка' : `http=${probe.httpStatus}`}`,
        );
      }

      db.prepare('UPDATE scan_runs SET requests_done = ? WHERE id = ?').run(i + 1, runId);

      if (i < candidates.length - 1) {
        if ((i + 1) % VERIFY_BATCH_SIZE === 0) {
          await sleep(batchPauseDelay());
        } else {
          await sleep(randomDelay());
        }
      }
    }

    const error = unknownIssues.length > 0 ? `verify unknown: ${unknownIssues.join('; ')}` : null;

    db.prepare(
      'UPDATE scan_runs SET finished_at = ?, found = ?, new_count = ?, disabled_count = ?, error = ? WHERE id = ?',
    ).run(
      new Date().toISOString(),
      result.checked,
      result.reactivated,
      result.disabled_count,
      error,
      runId,
    );

    return result;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    db.prepare('UPDATE scan_runs SET finished_at = ?, error = ? WHERE id = ?').run(
      new Date().toISOString(),
      message,
      runId,
    );
    throw err;
  }
}
