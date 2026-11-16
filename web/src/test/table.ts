// Таблиця випадків модуля (docs/development.md §7): один рядок — один випадок «виклик → очікуване».
import { expect, it } from 'vitest';

export interface Case {
  /** Назва випадку: функція + що перевіряємо. */
  name: string;
  /** Виклик функції модуля на даних із фабрик. */
  run: () => unknown;
  /** Очікуваний результат; для часткового порівняння — `expect.objectContaining(...)` тощо. */
  expected: unknown;
}

/** Проганяє таблицю випадків модуля: кожен рядок — окремий тест. */
export function runCases(cases: Case[]): void {
  it.each(cases)('$name', ({ run, expected }) => {
    expect(run()).toEqual(expected);
  });
}
