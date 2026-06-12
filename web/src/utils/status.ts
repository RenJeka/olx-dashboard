import type { ListingStatus } from '../types';

/** Лейбли статусів для UI (B1). */
export const STATUS_LABELS: Record<ListingStatus, string> = {
  new: 'Нове',
  interested: 'Цікаво',
  contacted: 'Написав',
  rejected: 'Не цікаво',
  disabled: 'Вимкнено',
};

/** colorPalette для бейджа/селекта статусу (B1). */
export const STATUS_COLORS: Record<ListingStatus, string> = {
  new: 'blue',
  interested: 'green',
  contacted: 'purple',
  rejected: 'gray',
  disabled: 'red',
};

/** Рядки з цими статусами показуємо приглушеними (opacity). */
export function isMutedStatus(status: string): boolean {
  return status === 'disabled' || status === 'rejected';
}
