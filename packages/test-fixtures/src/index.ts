import type { ProbeMessage } from '@mobile-ai-rp/storage-contracts';

/** Original synthetic data; never a real user's messages or a third-party card. */
export function createProbeMessages(count: number): ProbeMessage[] {
  if (!Number.isSafeInteger(count) || count < 0 || count > 10000) {
    throw new RangeError('Fixture count must be an integer between 0 and 10000');
  }
  return Array.from({ length: count }, (_, index) => ({
    id: `probe-${index + 1}`,
    sequence: index + 1,
    role: index % 2 === 0 ? 'user' : 'assistant',
    text: `${index + 1}: 你好，旅人。Synthetic narrative ${'山川与星光。'.repeat(index % 10 === 0 ? 150 : 3)}`,
  }));
}

/** In-process mock transport for the native lab; this does not prove network access. */
export function createMockStreamFetch(delayMs = 120) {
  return async (_input: string, init?: RequestInit) => {
    const signal = init?.signal;
    const encoder = new TextEncoder();
    const parts = ['你好', '，旅人', '。这里', '是 Gate 0', ' 的流式', '技术验证。'];
    let index = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let detach = () => {};
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        const abort = () => {
          if (timer !== undefined) clearTimeout(timer);
          detach();
          controller.error(new Error('aborted'));
        };
        detach = () => signal?.removeEventListener('abort', abort);
        if (signal?.aborted) {
          abort();
          return;
        }
        signal?.addEventListener('abort', abort, { once: true });
        const emit = () => {
          if (index >= parts.length) {
            controller.enqueue(encoder.encode('data: [DONE]\n\n'));
            detach();
            controller.close();
            return;
          }
          const data = JSON.stringify({ choices: [{ delta: { content: parts[index++] } }] });
          controller.enqueue(encoder.encode(`data: ${data}\n\n`));
          timer = setTimeout(emit, delayMs);
        };
        timer = setTimeout(emit, delayMs);
      },
      cancel() {
        if (timer !== undefined) clearTimeout(timer);
        detach();
      },
    });
    // React Native's global Response is not guaranteed to accept a stream body.
    return {
      ok: true,
      status: 200,
      headers: {
        get: (name: string) => (name.toLowerCase() === 'content-type' ? 'text/event-stream' : null),
      },
      body,
    };
  };
}
