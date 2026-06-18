import { toaster } from '../components/ui/toaster';

/** Показує error-тост з описом помилки (замінює дублікат у AI-діалогах). */
export function showErrorToast(title: string, err: unknown) {
  toaster.create({
    type: 'error',
    title,
    description: err instanceof Error ? err.message : String(err),
  });
}
