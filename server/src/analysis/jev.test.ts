import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  JevRetryableError,
  RELEVANT_KEY,
  criteriaAbove,
  criteriaQuestions,
  decide,
  listingState,
  parseDecisionsResponse,
  relevanceQuestion,
  runPool,
  type JevQuestion,
} from './jev.js';

const questions: Record<string, JevQuestion> = {
  relevant: { type: 'noul', instructions: 'Is it?' },
  cond: { type: 'choice', instructions: 'Which?', criteria: { new: 'New', used: 'Used' } },
};

const okBody = {
  model: 'typesafe/jev-1.13-20260917',
  answers: {
    relevant: { type: 'noul', noul: 0.91 },
    cond: { type: 'choice', choice: 'used', confidence: 0.6, probabilities: { new: 0.2, used: 0.8 } },
  },
  usage: { input_tokens: 476, output_tokens: 70, cost: 0.000019992 },
};

describe('parseDecisionsResponse', () => {
  it('валідна відповідь → typed answers + usage', () => {
    const r = parseDecisionsResponse(okBody, questions);
    expect(r.model).toBe('typesafe/jev-1.13-20260917');
    expect(r.answers.relevant).toEqual({ type: 'noul', noul: 0.91 });
    expect(r.answers.cond).toMatchObject({ type: 'choice', choice: 'used' });
    expect(r.usage.cost).toBeCloseTo(0.000019992);
  });

  it('немає відповіді на питання або тип не той → помилка', () => {
    const missing = { ...okBody, answers: { relevant: okBody.answers.relevant } };
    expect(() => parseDecisionsResponse(missing, questions)).toThrow(/cond/);
    const wrongType = { ...okBody, answers: { ...okBody.answers, relevant: { type: 'score', score: 1 } } };
    expect(() => parseDecisionsResponse(wrongType, questions)).toThrow(/relevant/);
  });

  it('noul поза 0…1 → помилка', () => {
    const bad = { ...okBody, answers: { ...okBody.answers, relevant: { type: 'noul', noul: 1.5 } } };
    expect(() => parseDecisionsResponse(bad, questions)).toThrow();
  });

  it('без usage.cost → помилка (не рахуємо як безкоштовне)', () => {
    const noCost = { ...okBody, usage: { input_tokens: 10, output_tokens: 0 } };
    expect(() => parseDecisionsResponse(noCost, questions)).toThrow(/usage\.cost/);
  });
});

describe('state і питання', () => {
  const listing = { id: 7, title: 'iPhone 13 128GB', characteristics: 'Б/в, Apple', description: 'x'.repeat(2000) };

  it('listingState: лише назва/характеристики/опис, опис обрізано, без id', () => {
    const s = listingState(listing, 300);
    expect(Object.keys(s)).toEqual(['title', 'characteristics', 'description']);
    expect(s.description).toHaveLength(300);
  });

  it('listingState: порожні характеристики не потрапляють у state', () => {
    expect(listingState({ ...listing, characteristics: '' }, 300)).not.toHaveProperty('characteristics');
  });

  it('relevanceQuestion містить ціль і синоніми; EN і UK', () => {
    expect(relevanceQuestion('iphone 13', ['айфон 13'], 'en').instructions).toContain('"iphone 13" or "айфон 13"');
    expect(relevanceQuestion('iphone 13', [], 'uk').instructions).toMatch(/^Чи це оголошення .*"iphone 13"/);
  });

  it('criteriaQuestions + criteriaAbove: поріг відбирає канонічні критерії за режимом', () => {
    const criteria = { cons: ['без торгу', 'подряпини'], pros: ['можливий торг'] };
    const q = criteriaQuestions(criteria, 'en');
    expect(Object.keys(q)).toEqual(['cons_0', 'cons_1', 'pros_0']);
    const result = parseDecisionsResponse(
      {
        model: 'm',
        answers: {
          cons_0: { type: 'noul', noul: 0.2 },
          cons_1: { type: 'noul', noul: 0.75 },
          pros_0: { type: 'noul', noul: 0.95 },
        },
        usage: { input_tokens: 1, output_tokens: 0, cost: 0 },
      },
      q,
    );
    expect(criteriaAbove(result, criteria, 0.7)).toEqual({ cons: ['подряпини'], pros: ['можливий торг'] });
    expect(criteriaAbove(result, criteria, 0.9)).toEqual({ cons: [], pros: ['можливий торг'] });
  });

  it('ключ релевантності не перетинається з ключами критеріїв', () => {
    expect(Object.keys(criteriaQuestions({ cons: ['a'], pros: ['b'] }, 'en'))).not.toContain(RELEVANT_KEY);
  });
});

describe('runPool', () => {
  it('порядок збережено, помилка елемента не валить прогін', async () => {
    const out = await runPool([1, 2, 3], async (n) => {
      if (n === 2) throw new Error('boom');
      return n * 10;
    }, 2);
    expect(out).toEqual([{ ok: true, value: 10 }, { ok: false, error: 'boom' }, { ok: true, value: 30 }]);
  });
});

describe('decide — HTTP', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it('без ключа → зрозуміла помилка', async () => {
    vi.stubEnv('OPENROUTER_API_KEY', '');
    await expect(decide('x', questions)).rejects.toThrow(/OPENROUTER_API_KEY/);
  });

  it('400 → помилка без повтору', async () => {
    vi.stubEnv('OPENROUTER_API_KEY', 'test');
    const fetchMock = vi.fn(async () => new Response('{"error":"bad"}', { status: 400 }));
    vi.stubGlobal('fetch', fetchMock);
    await expect(decide('x', questions)).rejects.toThrow(/HTTP 400/);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('429 з Retry-After → повтор і успіх', async () => {
    vi.stubEnv('OPENROUTER_API_KEY', 'test');
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response('{}', { status: 429, headers: { 'Retry-After': '0.01' } }))
      .mockResolvedValueOnce(new Response(JSON.stringify(okBody), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const r = await decide('x', questions);
    expect(r.answers.relevant).toEqual({ type: 'noul', noul: 0.91 });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('JevRetryableError несе retryAfterMs', () => {
    expect(new JevRetryableError('x', 500).retryAfterMs).toBe(500);
  });
});
