// Центральний вибір кольорів застосунку — єдине джерело істини для палітр.
// Змінив тут → змінилось скрізь (через семантичний токен `accent` у tokens.ts
// та re-export STATUS_COLORS у utils/status.ts).

import type { ListingStatus } from '../types';

/**
 * Базова Chakra-палітра акценту. Усі акцентні елементи (кнопки, бейджі, лінки,
 * прогрес скану) використовують `colorPalette="accent"`, що аліасить на цю палітру.
 * Зміни на `'teal'`/`'purple'`/… → акцент зміниться по всьому застосунку.
 */
export const ACCENT_BASE = 'blue';

/**
 * Семантичні ключі, які Chakra v3 очікує від будь-якої `colorPalette`.
 * `accent` аліасить кожен із них на відповідний токен `ACCENT_BASE` (tokens.ts).
 */
export const PALETTE_SEMANTIC_KEYS = [
  'contrast',
  'fg',
  'subtle',
  'muted',
  'emphasized',
  'solid',
  'focusRing',
  'border',
] as const;

/** Кроки числової шкали палітри Chakra (для прямих відтінків accent.50…950). */
export const PALETTE_SCALE_STEPS = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950] as const;

/** colorPalette для бейджа/селекта статусу оголошення (зразок — utils/status.ts). */
export const STATUS_PALETTE: Record<ListingStatus, string> = {
  new: 'accent',
  interested: 'green',
  contacted: 'purple',
  rejected: 'gray',
  disabled: 'red',
};
