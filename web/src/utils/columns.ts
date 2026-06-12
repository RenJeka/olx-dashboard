import { TOGGLEABLE_COLUMNS } from '../components/table/columns';

/** Повертає впорядкований список колонок згідно з збереженим порядком.
 *  Колонки, яких немає в order (нові), додаються в кінець.
 *  Застарілі id (видалені колонки) ігноруються. */
export function getOrderedColumns(order: string[]) {
  if (order.length === 0) return TOGGLEABLE_COLUMNS;
  const known = new Set(TOGGLEABLE_COLUMNS.map((c) => c.id));
  // Фільтруємо збережений порядок — видаляємо застарілі id
  const filtered = order.filter((id) => known.has(id));
  // Додаємо нові колонки, яких ще немає в order
  const inOrder = new Set(filtered);
  const extras = TOGGLEABLE_COLUMNS.filter((c) => !inOrder.has(c.id));
  const orderedIds = [...filtered, ...extras.map((c) => c.id)];
  return orderedIds
    .map((id) => TOGGLEABLE_COLUMNS.find((c) => c.id === id)!)
    .filter(Boolean);
}
