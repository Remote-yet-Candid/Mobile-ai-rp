import type { RPProvider, RPRequest, StreamEvent } from '@mobile-ai-rp/rp-provider';

const request: RPRequest = {
  model: 'synthetic-probe',
  messages: [
    { id: 'probe', role: 'user', content: [{ type: 'text', text: 'Synthetic Gate 0 probe.' }] },
  ],
  generation: { maxOutputTokens: 32 },
};
const expectedText = '你好，旅人。模拟流正在运行。';

export type NetworkAcceptanceResult = Readonly<{
  completed: boolean;
  cancelledAfterFirstDelta: boolean;
  recovered: boolean;
}>;

/** Executes the injected native transport; reports contain no prompt, keys or endpoint. */
export async function runNetworkAcceptance(
  provider: RPProvider,
  signal: AbortSignal,
): Promise<NetworkAcceptanceResult> {
  async function collect(cancelAfterFirst: boolean) {
    const local = new AbortController();
    const cancel = () => local.abort();
    signal.addEventListener('abort', cancel, { once: true });
    if (signal.aborted) local.abort();
    const events: StreamEvent[] = [];
    try {
      for await (const event of provider.stream(request, local.signal)) {
        events.push(event);
        if (cancelAfterFirst && event.type === 'text_delta') local.abort();
      }
      if (signal.aborted) throw new Error('Acceptance cancelled');
      return events;
    } finally {
      signal.removeEventListener('abort', cancel);
      local.abort();
    }
  }
  const complete = (events: StreamEvent[]) =>
    events
      .filter((event) => event.type === 'text_delta')
      .map((event) => event.text)
      .join('') === expectedText &&
    events.at(-1)?.type === 'completed' &&
    !events.some((event) => event.type === 'error');
  const first = await collect(false);
  const cancelled = await collect(true);
  const recovered = await collect(false);
  return {
    completed: complete(first),
    cancelledAfterFirstDelta:
      cancelled.filter((event) => event.type === 'text_delta').length === 1 &&
      cancelled.at(-1)?.type === 'error' &&
      cancelled.some((event) => event.type === 'error' && event.kind === 'abort') &&
      !cancelled.some((event) => event.type === 'completed'),
    recovered: complete(recovered),
  };
}
