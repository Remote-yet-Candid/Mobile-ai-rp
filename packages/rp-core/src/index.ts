import type { RPMessage, RPRequest } from '@mobile-ai-rp/rp-provider';

export * from './roleplay.js';

export interface TokenMeter {
  measure(messages: readonly RPMessage[]): Readonly<{
    tokens: number;
    accuracy: 'exact' | 'estimate';
  }>;
}
export type PromptDecision = Readonly<{
  inputTokens: number;
  inputBudget: number;
  warnings: readonly string[];
}>;

/** Gate 0 contract spike: validate a fixed snapshot without silently truncating it. */
export function prepareRequest(
  request: RPRequest,
  budget: Readonly<{ contextWindow: number; safetyMargin: number }>,
  meter: TokenMeter,
): Readonly<{ request: RPRequest; decision: PromptDecision }> {
  const integers = [budget.contextWindow, budget.safetyMargin, request.generation.maxOutputTokens];
  if (
    integers.some((value) => !Number.isSafeInteger(value)) ||
    budget.contextWindow <= 0 ||
    budget.safetyMargin < 0 ||
    request.generation.maxOutputTokens <= 0 ||
    !request.model.trim() ||
    request.messages.length === 0
  ) {
    throw new RangeError('Invalid request or context budget');
  }
  // Detach caller-owned arrays and objects before the injected meter sees them.
  const messages = request.messages.map((message) =>
    Object.freeze({
      ...message,
      content: Object.freeze(message.content.map((content) => Object.freeze({ ...content }))),
    }),
  );
  const snapshot: RPRequest = Object.freeze({
    ...request,
    messages: Object.freeze(messages),
    generation: Object.freeze({ ...request.generation }),
  });
  const measured = meter.measure(snapshot.messages);
  if (!Number.isSafeInteger(measured.tokens) || measured.tokens < 0) {
    throw new RangeError('Invalid token measurement');
  }
  const inputBudget =
    budget.contextWindow - budget.safetyMargin - request.generation.maxOutputTokens;
  if (inputBudget < 0 || measured.tokens > inputBudget) {
    throw new RangeError('Prompt exceeds input budget; no content was silently removed');
  }
  return {
    request: snapshot,
    decision: {
      inputTokens: measured.tokens,
      inputBudget,
      warnings:
        measured.accuracy === 'estimate'
          ? ['Token count is an estimate; validate against the selected model tokenizer.']
          : [],
    },
  };
}
