// OpenRouter-клієнт (авто-режим). Звичайний fetch, без нової залежності.
import { getApiKey, OPENROUTER_URL } from './config.js';

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

/**
 * Один виклик chat-completions. Повертає сирий текст відповіді (без code-fence).
 * 1 ретрай на мережевій/HTTP-помилці. Кидає, якщо ключа немає або відповідь порожня.
 */
export async function chat(messages: ChatMessage[], options: ChatOptions): Promise<string> {
  const apiKey = getApiKey();
  if (!apiKey) {
    throw new Error('OPENROUTER_API_KEY не налаштовано (авто-режим недоступний)');
  }

  const body: Record<string, unknown> = {
    model: options.model,
    messages,
    response_format: { type: 'json_object' },
  };
  if (options.reasoning) {
    body.reasoning = { enabled: true };
  } else {
    body.reasoning = { enabled: false };
  }

  let lastErr: unknown;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetch(OPENROUTER_URL, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': 'http://localhost:5173',
          'X-Title': 'OLX Dashboard',
        },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const detail = await res.text().catch(() => '');
        throw new Error(`OpenRouter HTTP ${res.status}: ${detail.slice(0, 300)}`);
      }

      const json = (await res.json()) as {
        choices?: { message?: { content?: string } }[];
      };
      const content = json.choices?.[0]?.message?.content;
      if (!content) throw new Error('OpenRouter повернув порожню відповідь');

      return stripCodeFence(content);
    } catch (err) {
      lastErr = err;
    }
  }

  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}
