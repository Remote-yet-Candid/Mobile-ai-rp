import { describe, expect, it } from 'vitest';
import type { RPMessage } from '@mobile-ai-rp/rp-provider';
import {
  estimatedTokenMeter,
  prepareRoleplayRequest,
  type RoleplayRequestInput,
  type TokenMeter,
} from '../src/index.js';

const message = (id: string, role: 'user' | 'assistant', text = id): RPMessage => ({
  id,
  role,
  content: [{ type: 'text', text }],
});
const input: RoleplayRequestInput = {
  model: 'mock-model',
  character: {
    name: 'Mira',
    description: '{{char}} is a navigator meeting {{user}}.',
    personality: 'Patient and curious.',
    scenario: 'A quiet observatory.',
    first_mes: 'Welcome aboard.',
    mes_example: '{{user}}: Hello\n{{char}}: Welcome.',
    system_prompt: 'Stay in character.',
    post_history_instructions: 'Respond as {{char}}.',
  },
  history: [message('u1', 'user', 'Where are we?')],
  contextWindow: 4096,
  maxOutputTokens: 256,
  userName: 'Alex',
};
const messageMeter: TokenMeter = {
  measure: (messages) => ({ tokens: messages.length * 10, accuracy: 'exact' }),
};
const flattened = (result: ReturnType<typeof prepareRoleplayRequest>) =>
  result.request.messages.flatMap((entry) => entry.content.map((part) => part.text)).join('\n');

describe('single-character roleplay prompt', () => {
  it('uses actual character constraints, examples and post-history instructions', () => {
    const result = prepareRoleplayRequest(input);
    expect(flattened(result)).toContain('Mira is a navigator meeting Alex.');
    expect(flattened(result)).toContain('Patient and curious.');
    expect(flattened(result)).toContain('A quiet observatory.');
    expect(flattened(result)).toContain('Welcome aboard.');
    expect(flattened(result)).toContain('Alex: Hello\nMira: Welcome.');
    expect(result.request.messages.at(-1)?.content[0]?.text).toBe('Respond as Mira.');
    expect(result.request.model).toBe('mock-model');
    expect(result.inspection.sections.map((section) => section.name)).toEqual([
      'character',
      'history',
      'post_history_instructions',
    ]);
    expect(result.inspection.accuracy).toBe('estimate');
    expect(result.decision.warnings.join(' ')).toContain('estimate');
  });

  it('does not insert creator metadata, extensions or inactive worldbook entries', () => {
    const character = {
      ...input.character,
      creator_notes: 'PRIVATE_CREATOR_NOTES',
      extensions: { script: 'EXECUTE_SCRIPT' },
      character_book: { entries: [{ content: 'INACTIVE_WORLDBOOK' }] },
      metadata: 'PRIVATE_METADATA',
    };
    const prompt = flattened(prepareRoleplayRequest({ ...input, character }));
    expect(prompt).not.toMatch(/PRIVATE|EXECUTE_SCRIPT|INACTIVE_WORLDBOOK/);
  });

  it('leaves macros and replacement values as literal data, without recursive substitution', () => {
    const result = prepareRoleplayRequest({
      ...input,
      character: {
        name: '{{user}}',
        description: '{{char}} {{user}} {{random::a::b}} {{eval:1+1}} <script>throw 1</script>',
      },
      userName: '$& {{char}}',
    });
    expect(flattened(result)).toContain('{{user}} $& {{char}} {{random::a::b}} {{eval:1+1}}');
    expect(flattened(result)).toContain('<script>throw 1</script>');
  });

  it('removes the oldest complete turns, preserving greeting, newest user and whole settings', () => {
    const result = prepareRoleplayRequest(
      {
        ...input,
        history: [
          message('greeting', 'assistant'),
          message('u1', 'user'),
          message('a1', 'assistant'),
          message('u2', 'user'),
          message('a2', 'assistant'),
          message('u3', 'user'),
        ],
        contextWindow: 60,
        maxOutputTokens: 10,
        safetyMargin: 0,
      },
      messageMeter,
    );
    expect(result.inspection.includedMessageIds).toEqual(['greeting', 'u3']);
    expect(result.inspection.droppedMessageIds).toEqual(['u1', 'a1', 'u2', 'a2']);
    expect(result.request.messages[0]?.content[0]?.text).toContain('Patient and curious.');
    expect(result.decision.warnings.join(' ')).toContain('complete turns');
    expect(result.inspection.accuracy).toBe('exact');
  });

  it('does not remove incomplete earlier user turns', () => {
    const result = prepareRoleplayRequest(
      {
        ...input,
        history: [
          message('pending', 'user'),
          message('u2', 'user'),
          message('a2', 'assistant'),
          message('u3', 'user'),
        ],
        contextWindow: 50,
        maxOutputTokens: 10,
        safetyMargin: 0,
      },
      messageMeter,
    );
    expect(result.inspection.includedMessageIds).toEqual(['pending', 'u3']);
    expect(result.inspection.droppedMessageIds).toEqual(['u2', 'a2']);
  });

  it('fails when whole settings and current user cannot fit; input remains unchanged', () => {
    const before = JSON.stringify(input);
    expect(() =>
      prepareRoleplayRequest(
        {
          ...input,
          contextWindow: 20,
          maxOutputTokens: 10,
          safetyMargin: 0,
        },
        messageMeter,
      ),
    ).toThrow('nothing was truncated');
    expect(JSON.stringify(input)).toBe(before);
  });

  it('detaches and freezes snapshots before an injected meter sees them', () => {
    const caller = { ...input, history: [message('u1', 'user')] };
    const before = JSON.stringify(caller);
    const meter: TokenMeter = {
      measure: (messages) => {
        expect(Object.isFrozen(messages)).toBe(true);
        expect(Object.isFrozen(messages[0]?.content[0])).toBe(true);
        return { tokens: 10, accuracy: 'exact' };
      },
    };
    const result = prepareRoleplayRequest(caller, meter);
    expect(result.request.messages[1]).not.toBe(caller.history[0]);
    expect(Object.isFrozen(result.inspection)).toBe(true);
    expect(Object.isFrozen(result.inspection.includedMessageIds)).toBe(true);
    expect(JSON.stringify(caller)).toBe(before);
    expect(prepareRoleplayRequest(caller, meter)).toEqual(result);
  });

  it('keeps user text literal instead of applying character macros to history', () => {
    const result = prepareRoleplayRequest({
      ...input,
      history: [message('u', 'user', '{{char}}')],
    });
    expect(result.request.messages[1]?.content[0]?.text).toBe('{{char}}');
  });

  it.each([NaN, Infinity, -1, 0.5])('rejects invalid token result %s', (tokens) => {
    expect(() =>
      prepareRoleplayRequest(input, {
        measure: () => ({ tokens, accuracy: 'exact' }),
      }),
    ).toThrow('Invalid token measurement');
  });

  it('rejects invalid history and generation settings', () => {
    expect(() => prepareRoleplayRequest({ ...input, history: [] })).toThrow('Generation history');
    expect(() =>
      prepareRoleplayRequest({ ...input, history: [message('a', 'assistant')] }),
    ).toThrow('Generation history');
    expect(() =>
      prepareRoleplayRequest({ ...input, history: [{ ...message('s', 'user'), role: 'system' }] }),
    ).toThrow('Generation history');
    expect(() =>
      prepareRoleplayRequest({ ...input, history: [message('u1', 'user'), message('u1', 'user')] }),
    ).toThrow('unique');
    expect(() => prepareRoleplayRequest({ ...input, temperature: NaN })).toThrow(
      'Invalid roleplay',
    );
    expect(() => prepareRoleplayRequest({ ...input, maxOutputTokens: -1 })).toThrow(
      'Invalid roleplay',
    );
  });

  it('exports an explicit deterministic estimator supporting CJK and supplementary Unicode', () => {
    const history = [message('u', 'user', '你好🌌abcd')];
    expect(estimatedTokenMeter.measure(history)).toEqual({ tokens: 15, accuracy: 'estimate' });
  });
});
