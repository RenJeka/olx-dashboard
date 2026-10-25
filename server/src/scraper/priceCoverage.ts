import type { PriceCoverage, SearchConfig } from '../types.js';

/**
 * Ціновий діапазон повного покриття видачі (docs/plans/verify-graphql.md, частина 1).
 * Повністю вичерпана видача доводить відсутність оголошення лише в межах цін, які вона
 * справді пройшла: split-скан бачить [нижня межа фільтра; зондована максимальна ціна],
 * а оголошення без ціни («Безкоштовно», «Обмін») OLX віддає лише в діапазоні від 0.
 */

/** Чи потрапляють оголошення без ціни в діапазон із такою нижньою межею (рішення людини 2026-10-25). */
function includesUnpriced(from: number | null): boolean {
  return from == null || from <= 0;
}

/** Покриття вичерпаної видачі без розбиття — у межах цінового фільтра самого пошуку. */
export function coverageFromPriceFilter(search: SearchConfig): PriceCoverage {
  const range = search.apiFilters.ranges?.price;
  const from = range?.from ?? null;
  return { from, to: range?.to ?? null, includesNull: includesUnpriced(from) };
}

/** Покриття вичерпаного split-скану: від нижньої межі бісекції до верхньої. */
export function coverageFromSplit(from: number, to: number): PriceCoverage {
  return { from, to, includesNull: includesUnpriced(from) };
}

/**
 * Перетин покриттів варіантів (синонімів): оголошення могло відповідати лише одному варіанту,
 * тож його відсутність доведена тільки там, де ПОВНІСТЮ пройшли всі варіанти.
 */
export function intersectCoverage(a: PriceCoverage, b: PriceCoverage): PriceCoverage {
  const from = a.from == null ? b.from : b.from == null ? a.from : Math.max(a.from, b.from);
  const to = a.to == null ? b.to : b.to == null ? a.to : Math.min(a.to, b.to);
  return { from, to, includesNull: a.includesNull && b.includesNull };
}
