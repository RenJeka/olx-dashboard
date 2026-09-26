// Кастомна конфігурація теми Chakra v3: семантичний токен `accent`.
// `accent` — аліас на палітру `ACCENT_BASE` (palette.ts): кожен семантичний ключ
// (solid/fg/subtle/…) вказує на відповідний токен базової палітри. Завдяки цьому
// `colorPalette="accent"` поводиться ідентично `colorPalette="<ACCENT_BASE>"`,
// включно зі світлою/темною темою — але керується з одного місця.

import { defineConfig } from '@chakra-ui/react';
import {
  ENHANCED_PALETTES,
  PALETTE_SCALE_STEPS,
  PALETTE_SEMANTIC_KEYS,
  THEME_PALETTES,
} from './palette';

type TokenValue = string | { _light: string; _dark: string };
type TokenSet = Record<string, { value: TokenValue }>;

/** Будує семантичні токени-аліаси (solid/fg/subtle/…) на задану базову палітру. */
function aliasSemantic(base: string): TokenSet {
  return Object.fromEntries(
    PALETTE_SEMANTIC_KEYS.map((key) => {
      if (key === 'fg') {
        // У світлій темі використовуємо насичений крок .600 замість дефолтного .700 (який
        // виглядає приглушеним/темно-синім/коричневим). Це дає чисті, контрастні кольори,
        // особливо для синього тексту, без ефекту "мьюченості".
        return [key, { value: { _light: `{colors.${base}.600}`, _dark: `{colors.${base}.300}` } }];
      }
      return [key, { value: `{colors.${base}.${key}}` }];
    }),
  );
}

/** Будує числову шкалу-аліас (50…950) на задану базову палітру. */
function aliasScale(base: string): TokenSet {
  return Object.fromEntries(
    PALETTE_SCALE_STEPS.map((step) => [step, { value: `{colors.${base}.${step}}` }]),
  );
}

/** Аліас-палітри теми (accent/success/warning/danger/info): ім'я → набір токенів. */
function buildPalettes(transform: (base: string) => TokenSet): Record<string, any> {
  return Object.fromEntries(
    Object.entries(THEME_PALETTES).map(([name, base]) => [name, transform(base)]),
  );
}

/**
 * Перевизначає семантичний токен `.fg` для базових палітр Chakra (blue, green, orange тощо)
 * у світлій темі на крок `.600` замість дефолтного `.700`.
 * Дефолтний крок `.700` у Chakra v3 приглушений і темний (темно-синій, коричневий, брудно-зелений),
 * через що кольоровий текст і лінки виглядають "мьюченими" і втрачають контрастність відтінку.
 * Крок `.600` — чистий, насичений і має високий контраст (> 4.5:1) на білому фоні.
 */
function buildEnhancedPalettes(): Record<string, any> {
  return Object.fromEntries(
    ENHANCED_PALETTES.map((palette) => [
      palette,
      {
        fg: { value: { _light: `{colors.${palette}.600}`, _dark: `{colors.${palette}.300}` } },
      },
    ]),
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
      colors: {
        // Загальні семантичні кольори тексту (щоб fg.subtle/fg.muted не були бляклими у світлій темі)
        fg: {
          DEFAULT: { value: { _light: '{colors.gray.900}', _dark: '{colors.gray.50}' } },
          muted: { value: { _light: '{colors.gray.700}', _dark: '{colors.gray.300}' } },
          subtle: { value: { _light: '{colors.gray.500}', _dark: '{colors.gray.400}' } },
        },
        // Покращені базові палітри (blue, purple, teal…) з яскравим та контрастним .fg
        ...buildEnhancedPalettes(),
        // Наші аліаси теми (accent, success, warning, danger, info)
        ...buildPalettes(aliasSemantic),
      },
    },
  },
});

