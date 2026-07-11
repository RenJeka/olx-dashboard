import { upsertListings } from '../scraper/normalizer.js';
import type { RawListing, ScanResult } from '../types.js';

/**
 * Інкрементальне збереження результатів скану (docs/plans/scan-failure-recovery.md).
 *
 * Великий глибокий скан (сотні запитів, ~година) раніше жив цілком у пам'яті й писався в БД
 * один раз наприкінці — будь-який збій дорогою втрачав УСЕ зібране. Persister дозволяє
 * фетчерам flush-ити зібране ітераціями (сторінка deep-скану / ціновий бакет / варіант
 * синоніма): якщо скан упаде чи процес помре, все, що пройшло flush, лишається в БД.
 *
 * - Дедуп: уже збережені у ЦЬОМУ скані `olx_id` повторно не пишуться (жодного подвійного
 *   Turso-запису; `found`/`new_count` не завищуються).
 * - `flushSafe` — для проміжних флашів: транзієнтна помилка БД НЕ валить скан, незбережені
 *   рядки лишаються в `pending` і поїдуть із наступним flush.
 * - `flush` — для фінального запису у `finalizeScanResult`: помилка прокидається (якщо БД
 *   недоступна навіть наприкінці — скан чесно позначається failed, але все, що встигло
 *   зберегтися раніше, вже в БД).
 */
export class ScanPersister {
  /** olx_id, які вже реально записані в БД у цьому скані. */
  private persisted = new Set<number>();
  /** Черга на запис: додані, але ще не збережені (напр. після збою проміжного flush). */
  private pending = new Map<number, RawListing>();
  private newCount = 0;

  constructor(private searchId: number) {}

  /** Проміжний flush: помилка запису ковтається (дані лишаються в pending до наступної спроби). */
  async flushSafe(items: RawListing[]): Promise<void> {
    try {
      await this.flush(items);
    } catch (err) {
      console.error(
        `[scan] проміжне збереження не вдалося (search=${this.searchId}, у черзі ${this.pending.size}):`,
        err instanceof Error ? err.message : err,
      );
    }
  }

  /** Upsert усіх ще не збережених оголошень (переданих + pending). Помилка прокидається. */
  async flush(items: RawListing[]): Promise<void> {
    for (const item of items) {
      if (!this.persisted.has(item.olxId)) this.pending.set(item.olxId, item);
    }
    if (this.pending.size === 0) return;

    const batch = [...this.pending.values()];
    const result = await upsertListings(this.searchId, batch);
    this.newCount += result.new_count;
    for (const item of batch) this.persisted.add(item.olxId);
    this.pending.clear();
  }

  /** Підсумки для ScanResult: унікальних збережено / з них нових. */
  get totals(): Pick<ScanResult, 'found' | 'new_count'> {
    return { found: this.persisted.size, new_count: this.newCount };
  }
}
