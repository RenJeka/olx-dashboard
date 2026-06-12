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
}

function loadSearch(id: number): SearchConfig | null {
  const row = db
    .prepare('SELECT id, name, query, category_id, api_filters FROM searches WHERE id = ?')
    .get(id) as SearchRow | undefined;

  if (!row) return null;

  let apiFilters: ApiFilters = {};
  try {
    apiFilters = JSON.parse(row.api_filters || '{}') as ApiFilters;
  } catch {
    apiFilters = {};
  }

  return {
    id: row.id,
    name: row.name,
    query: row.query,
    categoryId: row.category_id,
    apiFilters,
  };
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
}> {
  try {
    const result = await graphqlFetcher.fetchSearch(search, options);
    return {
      raw: result.listings,
      visibleTotalCount: result.visibleTotalCount,
      note: result.warning ?? null,
      requestsUsed: result.requestsUsed,
      exhausted: result.exhausted,
      usedGraphql: true,
      partial: result.warning != null,
    };
  } catch (graphqlErr) {
    const graphqlMessage =
      graphqlErr instanceof Error ? graphqlErr.message : String(graphqlErr);

    try {
      const result = await htmlFetcher.fetchSearch(search, options);
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

  const onProgress = (done: number, total: number): void => {
    db.prepare('UPDATE scan_runs SET requests_done = ?, requests_total = ? WHERE id = ?').run(
      done,
      total,
      runId,
    );
  };

  try {
    const { raw, visibleTotalCount, note, requestsUsed, exhausted, usedGraphql, partial } =
      await fetchWithFallback(search, {
        deep: options?.deep,
        onProgress,
      });
    const upsertResult = upsertListings(searchId, raw);

    // Вікно покриття (CLAUDE.md): лише для ПОВНИХ успішних GraphQL-сканів — не fallback
    // і не часткових (частковий deep із «window cap hit» не дає повної картини покриття).
    const { disabled_count } = usedGraphql && !partial
      ? applyScanStatuses(searchId, raw, exhausted)
      : { disabled_count: 0 };

    const result: ScanResult = { ...upsertResult, requestsUsed, disabled_count };

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
