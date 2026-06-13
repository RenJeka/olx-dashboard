import { toaster } from '../components/ui/toaster';

/** Копіює текст у буфер обміну і показує toast «Скопійовано». */
export function copyToClipboard(text: string, title = 'Скопійовано'): void {
  navigator.clipboard.writeText(text);
  toaster.create({ type: 'success', title });
}
