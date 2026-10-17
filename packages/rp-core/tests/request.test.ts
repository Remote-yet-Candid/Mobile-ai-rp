import { describe, expect, it } from 'vitest';
import { prepareRequest } from '../src/index.js';
import type { RPRequest } from '@mobile-ai-rp/rp-provider';

const request: RPRequest = {
  model: 'mock',
  messages: [{ id: '1', role: 'user', content: [{ type: 'text', text: '你好' }] }],
  generation: { maxOutputTokens: 20 },
};
const budget = { contextWindow: 100, safetyMargin: 10 };
describe('fixed prompt snapshot', () => {
  it('uses the injected token meter and reports estimation explicitly', () => {
    const result = prepareRequest(request, budget, {
      measure: () => ({ tokens: 12, accuracy: 'estimate' }),
    });
    expect(result.decision.inputBudget).toBe(70);
    expect(result.decision.warnings).toHaveLength(1);
    expect(result.request).toEqual(request);
    expect(result.request).not.toBe(request);
    expect(Object.isFrozen(result.request.messages[0]?.content)).toBe(true);
  });
  it('is deterministic and leaves the caller unchanged', () => {
    const meter = { measure: () => ({ tokens: 70, accuracy: 'exact' as const }) };
    const before = JSON.stringify(request);
    expect(prepareRequest(request, budget, meter)).toEqual(prepareRequest(request, budget, meter));
    expect(JSON.stringify(request)).toBe(before);
  });
  it('fails visibly rather than silently removing important content', () => {
    expect(() =>
      prepareRequest(request, budget, { measure: () => ({ tokens: 71, accuracy: 'exact' }) }),
    ).toThrow('exceeds input budget');
  });
  it.each([-1, NaN, Infinity, 0.5])('rejects invalid measurement %s', (tokens) => {
    expect(() =>
      prepareRequest(request, budget, { measure: () => ({ tokens, accuracy: 'exact' }) }),
    ).toThrow('Invalid token measurement');
  });
  it('rejects impossible output reservations', () => {
    expect(() =>
      prepareRequest(
        request,
        { contextWindow: 10, safetyMargin: 0 },
        {
          measure: () => ({ tokens: 0, accuracy: 'exact' }),
        },
      ),
    ).toThrow('exceeds input budget');
  });
});
