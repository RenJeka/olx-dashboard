/** Екранує спецсимволи регулярного виразу в рядку (для побудови RegExp з користувацького тексту). */
export function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
