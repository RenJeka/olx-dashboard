// Кастомна конфігурація теми Chakra v3: семантичний токен `accent`.
// `accent` — аліас на палітру `ACCENT_BASE` (palette.ts): кожен семантичний ключ
// (solid/fg/subtle/…) вказує на відповідний токен базової палітри. Завдяки цьому
// `colorPalette="accent"` поводиться ідентично `colorPalette="<ACCENT_BASE>"`,
// включно зі світлою/темною темою — але керується з одного місця.

import { defineConfig } from '@chakra-ui/react';
import { ACCENT_BASE, PALETTE_SCALE_STEPS, PALETTE_SEMANTIC_KEYS } from './palette';

/** Будує семантичні токени-аліаси (solid/fg/subtle/…) на задану базову палітру. */
function aliasSemantic(base: string) {
  return Object.fromEntries(
    PALETTE_SEMANTIC_KEYS.map((key) => [key, { value: `{colors.${base}.${key}}` }]),
  );
}

/** Будує числову шкалу-аліас (50…950) на задану базову палітру. */
function aliasScale(base: string) {
  return Object.fromEntries(
    PALETTE_SCALE_STEPS.map((step) => [step, { value: `{colors.${base}.${step}}` }]),
  );
}

export const customConfig = defineConfig({
  theme: {
    // Числова шкала accent.50…950 — щоб accent керував і прямими відтінками (heatmap, виділення).
    tokens: {
      colors: {
        accent: aliasScale(ACCENT_BASE),
      },
    },
    // Семантичні токени accent.solid/fg/… — щоб працював colorPalette="accent".
    semanticTokens: {
      colors: {
        accent: aliasSemantic(ACCENT_BASE),
      },
    },
  },
});
