import { useEffect, useState } from 'react';

/** Значення, що оновлюється лише після `delayMs` без змін (напр. запит до сервера під час набору). */
export function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);
  return debounced;
}
