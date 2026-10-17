/**
 * Збирач глобального дерева категорій OLX: для кожного слова тягне facet категорій (GraphQL)
 * і докидає вузли в `olx_categories`. Ввічливість до OLX — пауза між запитами (не після останнього).
 */
import { logWarn } from '../logger.js';
import { facetToNodes } from '../scraper/olxCategories.js';
import { fetchCategoryFacet } from '../scraper/graphql/categories.js';
import { randomDelayMs, sleep } from '../scraper/utils.js';
import { upsertCategories } from './tree.js';

/** Пауза між запитами збирача: 1–2 с. */
const DEFAULT_DELAY_MIN_MS = 1000;
const DEFAULT_DELAY_MAX_MS = 2000;

export interface CollectResult {
  /** Скільки слів оброблено (усі передані). */
  requested: number;
  /** Сума нових/змінених вузлів по всіх словах. */
  changed: number;
  /** Слова, для яких facet не отримано або запис упав. */
  failed: string[];
}

export interface CollectOptions {
  /** Затримка між запитами (мс); у тестах — миттєва. */
  delayMs?: () => number;
}

/**
 * Не кидає на помилці окремого слова: слово потрапляє у `failed`, збір іде далі.
 * Upsert — після кожного слова, тож частковий прогрес переживає пізніший збій.
 */
export async function collectCategories(
  words: string[],
  opts: CollectOptions = {},
): Promise<CollectResult> {
  const delayMs = opts.delayMs ?? (() => randomDelayMs(DEFAULT_DELAY_MIN_MS, DEFAULT_DELAY_MAX_MS));
  let changed = 0;
  const failed: string[] = [];

  for (let i = 0; i < words.length; i++) {
    const word = words[i]!;
    try {
      const facet = await fetchCategoryFacet(word);
      if (!facet) {
        failed.push(word);
      } else {
        changed += await upsertCategories(facetToNodes(facet));
      }
    } catch (err) {
      failed.push(word);
      logWarn('scanner', 'category-collect', err instanceof Error ? err.message : String(err), {
        word,
      });
    }
    if (i < words.length - 1) await sleep(delayMs());
  }

  return { requested: words.length, changed, failed };
}
