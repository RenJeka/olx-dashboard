// Тексти помилок сервісів — єдине джерело: код кидає їх через HttpError, тести порівнюють відповіді з ними
// (docs/development.md §7). Тексти AI-маршрутів — ANALYSIS_ERRORS в analysis/constants.ts.
export const SERVICE_ERRORS = {
  SEARCH_NOT_FOUND: 'Пошук не знайдено',
  SEARCH_FIELDS_REQUIRED: 'Поля name і query обовʼязкові',
  /** Останній збережений аналіз глибокого скану. */
  NO_ANALYSIS_YET: 'Аналізів ще не було',
  ANALYSIS_CORRUPTED: 'Збережений аналіз пошкоджено',
  PROJECT_NOT_FOUND: 'Проєкт не знайдено',
  PROJECT_NAME_REQUIRED: 'Поле name обовʼязкове',
  LISTING_NOT_FOUND: 'Оголошення не знайдено',
  /** Ручний порядок пошуків і проєктів. */
  BAD_DIRECTION: 'direction має бути "up" або "down"',
} as const;
