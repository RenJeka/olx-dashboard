import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useScan, useSearches } from '../api';
import { toaster } from '../components/ui/toaster';

const MIN_PAUSE_MS = 5000;
const MAX_PAUSE_MS = 10000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Клієнтське автооновлення: поки вкладка відкрита, раз на intervalMin хвилин запускає
 * швидкий скан усіх пошуків послідовно (з паузою 5-10с між ними). Тік пропускається,
 * якщо вкладка прихована або вже триває будь-який скан (ручний чи попередній тік).
 * Глибокий скан і перевірку це автооновлення ніколи не запускає.
 */
export function useAutoRefresh(enabled: boolean, intervalMin: number): void {
  const { data: searches } = useSearches();
  const scan = useScan();
  const queryClient = useQueryClient();

  const searchesRef = useRef(searches);
  searchesRef.current = searches;
  const mutateAsyncRef = useRef(scan.mutateAsync);
  mutateAsyncRef.current = scan.mutateAsync;

  useEffect(() => {
    if (!enabled) return;

    async function tick() {
      if (document.visibilityState !== 'visible') return;
      if (queryClient.isMutating({ mutationKey: ['scan'] }) > 0) return;
      const list = searchesRef.current ?? [];
      if (list.length === 0) return;

      toaster.create({
        type: 'info',
        title: `Автооновлення: сканую ${list.length} пошук${list.length === 1 ? '' : 'ів'}…`,
      });

      let totalNew = 0;
      for (const [i, item] of list.entries()) {
        try {
          const r = await mutateAsyncRef.current({ searchId: item.id, deep: false });
          totalNew += r.new_count;
        } catch {
          // Помилку конкретного пошуку показує його панель дій — тут продовжуємо.
        }
        if (i < list.length - 1) {
          await sleep(MIN_PAUSE_MS + Math.random() * (MAX_PAUSE_MS - MIN_PAUSE_MS));
        }
      }

      toaster.create({
        type: totalNew > 0 ? 'success' : 'info',
        title:
          totalNew > 0
            ? `Автооновлення: +${totalNew} нових серед ${list.length} пошуків`
            : 'Автооновлення: новин немає',
        duration: totalNew > 0 ? undefined : 3000,
      });
    }

    const timer = setInterval(() => void tick(), intervalMin * 60_000);
    return () => clearInterval(timer);
  }, [enabled, intervalMin, queryClient]);
}
