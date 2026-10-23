/** Людиномовний переклад внутрішніх fallbackReason з аналітичної фази (scanner.ts/fetcher.ts). */
export function describeFallback(reason: string): string {
  if (reason === 'no upper price bound') {
    return 'не вдалося визначити верхню межу ціни — повний скан пройде без розбиття на діапазони';
  }
  if (reason.startsWith('graphql analyze failed')) {
    return 'аналіз GraphQL не вдався — повний скан спробує ще раз і перейде на HTML, якщо потрібно';
  }
  return reason;
}

/** Внутрішній маркер у тексті серверного warning — рендериться скорочено з повним поясненням у тултіпі. */
export const COVERAGE_WARNING_PREFIX = 'вікно покриття буде пропущено';
