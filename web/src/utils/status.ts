import type { ListingStatus } from '../types';
import { STATUS_PALETTE } from '../theme/palette';

/** Лейбли статусів для UI (B1). */
export const STATUS_LABELS: Record<ListingStatus, string> = {
  new: 'Нове',
  interested: 'Цікаво',
  contacted: 'Написав',
  rejected: 'Не цікаво',
  disabled: 'Вимкнено',
};

/** colorPalette для бейджа/селекта статусу (B1) — джерело істини у theme/palette. */
export const STATUS_COLORS: Record<ListingStatus, string> = STATUS_PALETTE;

/** Рядки з цими статусами показуємо приглушеними (opacity). */
export function isMutedStatus(status: string): boolean {
  return status === 'disabled' || status === 'rejected';
}
