import { expect, it } from 'vitest';
import { createMockStreamFetch } from '@mobile-ai-rp/test-fixtures';
import { OpenAICompatibleProvider } from '../packages/provider-openai-compat/src/index.js';

it('runs the native lab mock through the same streaming port without a global Response wrapper', async () => {
  const provider = new OpenAICompatibleProvider({
    baseUrl: 'https://gate0.invalid/v1',
    fetch: createMockStreamFetch(1),
  });
  const events = await Array.fromAsync(
    provider.stream(
      { model: 'mock', messages: [], generation: { maxOutputTokens: 32 } },
      new AbortController().signal,
    ),
  );
  expect(
    events
      .filter((event) => event.type === 'text_delta')
      .map((event) => event.text)
      .join(''),
  ).toBe('你好，旅人。这里是 Gate 0 的流式技术验证。');
  expect(events.at(-1)).toEqual({ type: 'completed' });
});
