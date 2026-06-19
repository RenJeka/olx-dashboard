const CYRILLIC_RE = /[Ѐ-ӿ]/;

/** Латиниця — рядки без кириличних символів (інші алфавіти/цифри теж вважаються "не латиницею"). */
function isLatinScript(s: string): boolean {
  return !CYRILLIC_RE.test(s) && /[a-z]/i.test(s);
}

/**
 * Сортує рядки за алфавітом (укр. колація). Рядки латиницею — у кінець списку,
 * теж алфавітом між собою. Спільне для «Варіантів пошуку» й критеріїв AI-аналізу.
 */
export function sortAlpha(list: string[]): string[] {
  return [...list].sort((a, b) => {
    const aLatin = isLatinScript(a);
    const bLatin = isLatinScript(b);
    if (aLatin !== bLatin) return aLatin ? 1 : -1;
    return a.localeCompare(b, 'uk', { sensitivity: 'base' });
  });
}
