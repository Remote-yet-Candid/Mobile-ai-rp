import type { RPMessage, RPRequest } from '@mobile-ai-rp/rp-provider';
import { prepareRequest, type PromptDecision, type TokenMeter } from './index.js';

/** A structural prompt view, independent of card codecs and platform adapters. */
export type CharacterPromptData = Readonly<{
  name: string;
  description?: string;
  personality?: string;
  scenario?: string;
  first_mes?: string;
  mes_example?: string;
  system_prompt?: string;
  post_history_instructions?: string;
}>;

export type RoleplayRequestInput = Readonly<{
  model: string;
  character: CharacterPromptData;
  history: readonly RPMessage[];
  contextWindow: number;
  maxOutputTokens: number;
  temperature?: number;
  userName?: string;
  safetyMargin?: number;
}>;

export type RoleplayInspection = Readonly<{
  includedMessageIds: readonly string[];
  droppedMessageIds: readonly string[];
  accuracy: 'exact' | 'estimate';
  /** Each section is measured separately; message overhead means totals need not add up. */
  sections: readonly Readonly<{
    name: 'character' | 'history' | 'post_history_instructions';
    messageId: string;
    role: RPMessage['role'];
    characters: number;
    tokens: number;
  }>[];
}>;

export type PreparedRoleplayRequest = Readonly<{
  request: RPRequest;
  decision: PromptDecision;
  inspection: RoleplayInspection;
}>;

/** Portable heuristic, not a model tokenizer. Callers can inject an exact TokenMeter. */
export const estimatedTokenMeter: TokenMeter = Object.freeze({
  measure(messages: readonly RPMessage[]) {
    let tokens = 3;
    for (const message of messages) {
      let ascii = 0;
      let unicode = 0;
      for (const content of message.content) {
        for (const character of content.text) {
          if (character.codePointAt(0)! <= 127) ascii++;
          else unicode++;
        }
      }
      tokens += 8 + Math.ceil(ascii / 4) + unicode;
    }
    return { tokens, accuracy: 'estimate' as const };
  },
});

/** Only these two literal placeholders are supported; no expression or macro execution. */
function substitute(text: string, name: string, userName: string): string {
  return text.replace(/\{\{(char|user)\}\}/g, (_, key: string) =>
    key === 'char' ? name : userName,
  );
}

function textMessage(id: string, role: RPMessage['role'], text: string): RPMessage {
  return { id, role, content: [{ type: 'text', text }] };
}

function freezeMessages(messages: readonly RPMessage[]): readonly RPMessage[] {
  return Object.freeze(
    messages.map((message) =>
      Object.freeze({
        ...message,
        content: Object.freeze(message.content.map((part) => Object.freeze({ ...part }))),
      }),
    ),
  );
}

function measure(meter: TokenMeter, messages: readonly RPMessage[]) {
  const result = meter.measure(freezeMessages(messages));
  if (!Number.isSafeInteger(result.tokens) || result.tokens < 0) {
    throw new RangeError('Invalid token measurement');
  }
  if (result.accuracy !== 'exact' && result.accuracy !== 'estimate') {
    throw new RangeError('Invalid token measurement accuracy');
  }
  return result;
}

/**
 * Builds an immutable single-character prompt. Metadata, creator_notes, extensions and
 * character_book are deliberately not injected. Examples and the opening message are
 * descriptive system context; card macros, scripts and worldbooks are not interpreted.
 * Only complete earlier user/assistant turns can be removed. Character settings and
 * the latest user turn stay whole; insufficient remaining budget fails visibly.
 */
export function prepareRoleplayRequest(
  input: RoleplayRequestInput,
  meter: TokenMeter = estimatedTokenMeter,
): PreparedRoleplayRequest {
  const safetyMargin = input.safetyMargin ?? 256;
  if (
    !input.character.name.trim() ||
    !input.model.trim() ||
    !Number.isSafeInteger(input.contextWindow) ||
    !Number.isSafeInteger(input.maxOutputTokens) ||
    !Number.isSafeInteger(safetyMargin) ||
    input.contextWindow <= 0 ||
    input.maxOutputTokens <= 0 ||
    safetyMargin < 0 ||
    (input.temperature !== undefined &&
      (!Number.isFinite(input.temperature) || input.temperature < 0 || input.temperature > 2))
  ) {
    throw new RangeError('Invalid roleplay request or context budget');
  }
  if (
    !input.history.length ||
    input.history.at(-1)?.role !== 'user' ||
    input.history.some((message) => message.role !== 'user' && message.role !== 'assistant')
  ) {
    throw new RangeError(
      'Generation history must contain user/assistant messages and end in a user',
    );
  }
  const ids = input.history.map((message) => message.id);
  if (new Set(ids).size !== ids.length) throw new RangeError('History message IDs must be unique');
  const userName = input.userName?.trim() || 'User';
  const replace = (text: string) => substitute(text, input.character.name, userName);
  const fields: readonly (readonly [string, string | undefined])[] = [
    ['Character', input.character.name],
    ['System instructions', input.character.system_prompt],
    ['Description', input.character.description],
    ['Personality', input.character.personality],
    ['Scenario', input.character.scenario],
    ['Opening message', input.character.first_mes],
    ['Dialogue examples', input.character.mes_example],
  ];
  const setting = fields
    .filter((entry): entry is readonly [string, string] => Boolean(entry[1]?.trim()))
    .map(([label, text]) => `${label}:\n${replace(text)}`)
    .join('\n\n');
  const characterMessage = textMessage('rp:character', 'system', setting);
  const postHistory = input.character.post_history_instructions?.trim()
    ? textMessage('rp:post-history', 'system', replace(input.character.post_history_instructions))
    : undefined;
  const history = freezeMessages(input.history);
  const retained = [...history];
  const dropped: string[] = [];
  const inputBudget = input.contextWindow - safetyMargin - input.maxOutputTokens;
  const messages = () => [characterMessage, ...retained, ...(postHistory ? [postHistory] : [])];
  let measured = measure(meter, messages());
  while (measured.tokens > inputBudget) {
    // Preserve any opening assistant greeting. Remove only an earlier user with
    // its assistant replies, never the current user or an incomplete user turn.
    const start = retained.findIndex(
      (message, index) => message.role === 'user' && retained[index + 1]?.role === 'assistant',
    );
    if (start < 0) {
      throw new RangeError(
        'Character settings and latest user exceed input budget; nothing was truncated',
      );
    }
    let end = start + 1;
    while (retained[end]?.role === 'assistant') end++;
    dropped.push(...retained.splice(start, end - start).map((message) => message.id));
    measured = measure(meter, messages());
  }
  const result = prepareRequest(
    {
      model: input.model,
      messages: messages(),
      generation: {
        maxOutputTokens: input.maxOutputTokens,
        ...(input.temperature === undefined ? {} : { temperature: input.temperature }),
      },
    },
    { contextWindow: input.contextWindow, safetyMargin },
    meter,
  );
  const sections = result.request.messages.map((message, index) =>
    Object.freeze({
      name:
        index === 0
          ? ('character' as const)
          : postHistory && index === result.request.messages.length - 1
            ? ('post_history_instructions' as const)
            : ('history' as const),
      messageId: message.id,
      role: message.role,
      characters: message.content.reduce((total, part) => total + part.text.length, 0),
      tokens: measure(meter, [message]).tokens,
    }),
  );
  return Object.freeze({
    request: result.request,
    decision: Object.freeze({
      ...result.decision,
      warnings: Object.freeze([
        ...result.decision.warnings,
        ...(dropped.length
          ? [`Removed ${dropped.length} earlier messages as complete turns to fit context.`]
          : []),
      ]),
    }),
    inspection: Object.freeze({
      includedMessageIds: Object.freeze(retained.map((message) => message.id)),
      droppedMessageIds: Object.freeze(dropped),
      accuracy: measured.accuracy,
      sections: Object.freeze(sections),
    }),
  });
}
