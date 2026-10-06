// Проба кроку 2 рушієм Jev (docs/plans/jev-model.md → етап 3): показати дослівно, що йде в Decisions API
// і що повертається, по кожному критерію. Викликає продовий runJevMatching, а сирі тіла бере перехопленням
// fetch — тож бачимо саме те, що шле прод, а не копію логіки. Лише SELECT, у БД нічого не пише.
//   npm run jev:probe -- --search <id> [--top 5 | --ids 12,34] [--mode cons|pros] [--out <file>]
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { hasApiKey } from './analysis/config.js';
import { JEV_CRITERIA_THRESHOLD, JEV_DECISIONS_URL, MATCHING_DESC_SLICE, isMode } from './analysis/constants.js';
import { criterionKey, listingState } from './analysis/jev.js';
import { runJevMatching } from './analysis/jevEngine.js';
import { toPromptListing } from './analysis/promptData.js';
import { buildChunkListings } from './analysis/prompts.js';
import { getSavedCriteria } from './analysis/repo.js';
import { parseBullets, stripHtml } from './analysis/text.js';
import { dbAll, dbGet } from './db/db.js';

interface ProbeRow {
  id: number;
  title: string | null;
  description: string | null;
  params: string | null;
  url: string | null;
  cons: string | null;
  pros: string | null;
  analysis_source: string | null;
  analysis_model: string | null;
}

/** Один перехоплений виклик Decisions API (з ретраями їх буває кілька на оголошення). */
interface Captured {
  request: { model?: string; state?: unknown; questions?: Record<string, { instructions?: string }> };
  status: number;
  response: string;
}

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

/** Обгортає глобальний fetch: тіла запитів/відповідей до Decisions API складаються в `sink`. */
function captureDecisions(sink: Captured[]): void {
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    const res = await realFetch(input, init);
    if (url === JEV_DECISIONS_URL) {
      sink.push({
        request: JSON.parse(String(init?.body)) as Captured['request'],
        status: res.status,
        response: await res.clone().text(),
      });
    }
    return res;
  };
}

async function main(): Promise<void> {
  const searchId = Number(arg('search'));
  const mode = arg('mode') ?? 'cons';
  if (!Number.isFinite(searchId) || !isMode(mode)) {
    console.error('Використання: npm run jev:probe -- --search <id> [--top N | --ids a,b] [--mode cons|pros] [--out <file>]');
    process.exit(1);
  }
  if (!hasApiKey()) {
    console.error('Немає OPENROUTER_API_KEY у server/.env — Jev недоступний.');
    process.exit(1);
  }
  const search = await dbGet<{ query: string }>('SELECT query FROM searches WHERE id = ?', [searchId]);
  if (!search) {
    console.error(`Пошук #${searchId} не знайдено`);
    process.exit(1);
  }
  const criteria = (await getSavedCriteria(searchId))[mode];
  const allowed = new Set(criteria.map((c) => c.toLowerCase()));

  const all = await dbAll<ProbeRow>(
    'SELECT id, title, description, params, url, cons, pros, analysis_source, analysis_model FROM listings WHERE search_id = ?',
    [searchId],
  );
  const llmOf = (r: ProbeRow) => parseBullets(mode === 'cons' ? r.cons : r.pros);
  const ids = arg('ids')?.split(',').map(Number).filter(Number.isFinite);
  const rows = ids
    ? all.filter((r) => ids.includes(r.id))
    : all
        .filter((r) => r.analysis_source)
        .sort((a, b) => llmOf(b).filter((c) => allowed.has(c.toLowerCase())).length - llmOf(a).filter((c) => allowed.has(c.toLowerCase())).length)
        .slice(0, Number(arg('top') ?? 5));

  const captured: Captured[] = [];
  captureDecisions(captured);
  const response = await runJevMatching(criteria, mode, rows.map(toPromptListing));

  const chunks = new Map(buildChunkListings(rows.map(toPromptListing)).map((c) => [c.id, c]));
  const engineById = new Map(response.results.map((r) => [r.id, r.items]));
  const listings = rows.map((r) => {
    const chunk = chunks.get(r.id);
    const expectedState = chunk ? listingState(chunk, MATCHING_DESC_SLICE) : {};
    const calls = captured.filter((c) => JSON.stringify(c.request.state) === JSON.stringify(expectedState));
    const ok = calls.find((c) => c.status === 200);
    const answers = ok ? ((JSON.parse(ok.response) as { answers?: Record<string, { noul?: number }> }).answers ?? {}) : {};
    const questions = ok?.request.questions ?? {};
    const fullDescription = stripHtml(r.description);
    const llm = llmOf(r);
    const expectedKeys = criteria.map((_, i) => criterionKey(mode, i));
    return {
      id: r.id,
      title: r.title,
      url: r.url,
      fullDescription,
      descriptionChars: fullDescription.length,
      truncatedChars: Math.max(0, fullDescription.length - MATCHING_DESC_SLICE),
      keysCheck: {
        criteria: criteria.length,
        questionsSent: Object.keys(questions).length,
        answersReceived: Object.keys(answers).length,
        missingInRequest: expectedKeys.filter((k) => !(k in questions)),
        missingInResponse: expectedKeys.filter((k) => !(k in answers)),
      },
      attempts: calls.map((c) => c.status),
      rawRequest: ok?.request ?? null,
      rawResponse: ok ? (JSON.parse(ok.response) as unknown) : (calls.at(-1)?.response ?? null),
      criteria: criteria.map((criterion, i) => {
        const key = criterionKey(mode, i);
        const p = answers[key]?.noul;
        return {
          key,
          criterion,
          question: questions[key]?.instructions ?? null,
          probability: typeof p === 'number' ? p : null,
          passed: typeof p === 'number' && p >= JEV_CRITERIA_THRESHOLD,
          llmFound: llm.some((c) => c.toLowerCase() === criterion.toLowerCase()),
        };
      }),
      engineItems: engineById.get(r.id) ?? [],
      llmOutsideCriteria: llm.filter((c) => !allowed.has(c.toLowerCase())),
      // Чим зроблено збережений аналіз-орієнтир (може бути й сам Jev — тоді «ймовірно пропущено» нічого не доводить).
      referenceModel: r.analysis_model,
    };
  });

  const out = arg('out') ?? join(dirname(fileURLToPath(import.meta.url)), '..', 'data', 'jev-pilot', `probe-${searchId}-${mode}.json`);
  const report = {
    createdAt: new Date().toISOString(),
    search: { id: searchId, query: search.query },
    mode,
    threshold: JEV_CRITERIA_THRESHOLD,
    descSlice: MATCHING_DESC_SLICE,
    model: response.model,
    usage: response.usage,
    errors: response.errors,
    criteria,
    listings,
  };
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, JSON.stringify(report, null, 2));

  console.log(`Пошук #${searchId} «${search.query}», режим ${mode}, критеріїв ${criteria.length}, поріг ${JEV_CRITERIA_THRESHOLD}`);
  console.log(`Модель ${response.model}, запитів ${response.usage?.requests}, $${response.usage?.cost.toFixed(6)}`);
  if (response.errors.length > 0) console.log('Помилки:', response.errors.join('; '));
  for (const l of listings) {
    const k = l.keysCheck;
    const passed = l.criteria.filter((c) => c.passed).length;
    const llm = l.criteria.filter((c) => c.llmFound).length;
    const missed = l.criteria.filter((c) => c.llmFound && !c.passed).length;
    console.log(
      `#${l.id} опис ${l.descriptionChars} (обрізано ${l.truncatedChars}) | критеріїв ${k.criteria} → питань ${k.questionsSent} → відповідей ${k.answersReceived} | Jev ≥ порогу ${passed}, збережений аналіз ${llm}, є там / Jev ні ${missed}`,
    );
  }
  console.log(`→ ${out}`);
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
