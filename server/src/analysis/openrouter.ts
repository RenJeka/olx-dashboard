// OpenRouter-клієнт (авто-режим). Звичайний fetch, без нової залежності.
import { logWarn } from '../logger.js';
import { getApiKey } from './config.js';
import {
  OPENROUTER_ERROR_DETAIL_MAX_CHARS,
  OPENROUTER_MAX_ATTEMPTS,
  OPENROUTER_REFERER,
  OPENROUTER_RESPONSE_FORMAT,
  OPENROUTER_TITLE,
  OPENROUTER_URL,
} from './constants.js';

export interface ChatMessage {
  role: 'system' | 'user';
  content: string;
}

export interface ChatOptions {
  model: string;
  /** reasoning-режим (дефолт вимкнено) — за налаштуванням користувача. */
  reasoning?: boolean;
}

/** Знімає ```json … ``` обгортку, якщо модель її додала. */
function stripCodeFence(text: string): string {
  const trimmed = text.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return fenced ? (fenced[1] as string).trim() : trimmed;
}

/** Облік вартості виклику (OpenRouter usage accounting). */
export interface ChatUsage {
  prompt_tokens: number;
  completion_tokens: number;
  /** USD; 0, якщо OpenRouter не повернув cost. */
  cost: number;
}

/**
 * Один виклик chat-completions. Повертає сирий текст відповіді (без code-fence).
 * 1 ретрай на мережевій/HTTP-помилці. Кидає, якщо ключа немає або відповідь порожня.
 */
export async function chat(messages: ChatMessage[], options: ChatOptions): Promise<string> {
  return (await chatWithUsage(messages, options)).content;
}

/** Як chat(), але ще й з usage (токени + вартість) — для замірів вартості (jev-пілот). */
export async function chatWithUsage(
  messages: ChatMessage[],
  options: ChatOptions,
): Promise<{ content: string; usage: ChatUsage }> {
  const apiKey = getApiKey();
  if (!apiKey) {
    throw new Error('OPENROUTER_API_KEY не налаштовано (авто-режим недоступний)');
  }

  const body: Record<string, unknown> = {
    model: options.model,
    messages,
    response_format: OPENROUTER_RESPONSE_FORMAT,
  };
  if (options.reasoning) {
    body.reasoning = { enabled: true };
  } else {
    body.reasoning = { enabled: false };
  }

  let lastErr: unknown;
  for (let attempt = 0; attempt < OPENROUTER_MAX_ATTEMPTS; attempt++) {
    try {
      const res = await fetch(OPENROUTER_URL, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': OPENROUTER_REFERER,
          'X-Title': OPENROUTER_TITLE,
        },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const detail = await res.text().catch(() => '');
        throw new Error(
          `OpenRouter HTTP ${res.status}: ${detail.slice(0, OPENROUTER_ERROR_DETAIL_MAX_CHARS)}`,
        );
      }

      const json = (await res.json()) as {
        choices?: { message?: { content?: string } }[];
        usage?: { prompt_tokens?: number; completion_tokens?: number; cost?: number };
      };
      const content = json.choices?.[0]?.message?.content;
      if (!content) throw new Error('OpenRouter повернув порожню відповідь');

      return {
        content: stripCodeFence(content),
        usage: {
          prompt_tokens: json.usage?.prompt_tokens ?? 0,
          completion_tokens: json.usage?.completion_tokens ?? 0,
          cost: json.usage?.cost ?? 0,
        },
      };
    } catch (err) {
      lastErr = err;
      logWarn(
        'analysis',
        `openrouter attempt=${attempt + 1}/${OPENROUTER_MAX_ATTEMPTS}`,
        err instanceof Error ? err.message : String(err),
        { model: options.model },
      );
    }
  }

  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}
