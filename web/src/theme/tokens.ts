// Кастомна конфігурація теми Chakra v3: семантичний токен `accent`.
// `accent` — аліас на палітру `ACCENT_BASE` (palette.ts): кожен семантичний ключ
// (solid/fg/subtle/…) вказує на відповідний токен базової палітри. Завдяки цьому
// `colorPalette="accent"` поводиться ідентично `colorPalette="<ACCENT_BASE>"`,
// включно зі світлою/темною темою — але керується з одного місця.

import { defineConfig } from '@chakra-ui/react';
import { PALETTE_SCALE_STEPS, PALETTE_SEMANTIC_KEYS, THEME_PALETTES } from './palette';

type TokenSet = Record<string, { value: string }>;

/** Будує семантичні токени-аліаси (solid/fg/subtle/…) на задану базову палітру. */
function aliasSemantic(base: string): TokenSet {
  return Object.fromEntries(
    PALETTE_SEMANTIC_KEYS.map((key) => [key, { value: `{colors.${base}.${key}}` }]),
  );
}

/** Будує числову шкалу-аліас (50…950) на задану базову палітру. */
function aliasScale(base: string): TokenSet {
  return Object.fromEntries(
    PALETTE_SCALE_STEPS.map((step) => [step, { value: `{colors.${base}.${step}}` }]),
  );
}

/** Аліас-палітри теми (accent/success/warning/danger/info): ім'я → набір токенів. */
function buildPalettes(transform: (base: string) => TokenSet): Record<string, TokenSet> {
  return Object.fromEntries(
    Object.entries(THEME_PALETTES).map(([name, base]) => [name, transform(base)]),
  );
}

export const customConfig = defineConfig({
  theme: {
    // Числові шкали <palette>.50…950 — щоб теми керували й прямими відтінками (heatmap, виділення).
    tokens: {
      colors: buildPalettes(aliasScale),
    },
    // Семантичні токени <palette>.solid/fg/… — щоб працював colorPalette="<palette>".
    semanticTokens: {
      colors: buildPalettes(aliasSemantic),
    },
  },
});
