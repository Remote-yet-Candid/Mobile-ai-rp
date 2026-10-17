import { createServer, type Server, type RequestListener } from 'node:http';
import { afterEach, describe, expect, it } from 'vitest';
import { OpenAICompatibleProvider, readSseData } from '../src/index.js';
import type { RPRequest, StreamEvent } from '@mobile-ai-rp/rp-provider';

const request: RPRequest = {
  model: 'mock',
  messages: [{ id: '1', role: 'user', content: [{ type: 'text', text: '你好' }] }],
  generation: { maxOutputTokens: 32 },
};
const delta = (text: string) => JSON.stringify({ choices: [{ delta: { content: text } }] });
const sse = (text: string) => `data: ${delta(text)}\n\ndata: [DONE]\n\n`;
const servers = new Set<Server>();
afterEach(async () => {
  for (const server of servers) {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
  servers.clear();
});

async function serverFor(handler: RequestListener) {
  const server = createServer(handler);
  servers.add(server);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Missing server address');
  return `http://127.0.0.1:${address.port}/v1`;
}

async function collect(provider: OpenAICompatibleProvider, signal = new AbortController().signal) {
  return Array.fromAsync(provider.stream(request, signal));
}
function mocked(
  body: string,
  extra: Partial<ConstructorParameters<typeof OpenAICompatibleProvider>[0]> = {},
) {
  return new OpenAICompatibleProvider({
    baseUrl: 'https://example.invalid/v1',
    fetch: async () => new Response(body, { headers: { 'Content-Type': 'text/event-stream' } }),
    ...extra,
  });
}

describe('SSE framing', () => {
  it.each(['\n', '\r\n', '\r'])(
    'handles %j delimiters and bytewise UTF-8 fragmentation',
    async (newline) => {
      const data = `: comment${newline}event: message${newline}data: 你好${newline}data: 世界${newline}${newline}`;
      const bytes = new TextEncoder().encode(data);
      const body = new ReadableStream<Uint8Array>({
        start(controller) {
          for (const byte of bytes) controller.enqueue(Uint8Array.of(byte));
          controller.close();
        },
      });
      expect(await Array.fromAsync(readSseData(body, new AbortController().signal))).toEqual([
        '你好\n世界',
      ]);
    },
  );
  it('bounds events rather than accepting unbounded provider metadata', async () => {
    expect(
      (await collect(mocked(sse('x'.repeat(200)), { maxEventBytes: 64 }))).at(-1),
    ).toMatchObject({ type: 'error', kind: 'provider' });
  });
});

describe('OpenAI-compatible public subset', () => {
  it('performs an actual local HTTP request and streams Chinese text', async () => {
    let received: unknown;
    let authorization: string | undefined;
    let path: string | undefined;
    const url = await serverFor(async (req, res) => {
      authorization = req.headers.authorization;
      path = req.url;
      const chunks = [];
      for await (const chunk of req) chunks.push(chunk);
      received = JSON.parse(Buffer.concat(chunks).toString());
      res.writeHead(200, { 'Content-Type': 'text/event-stream' });
      res.end(sse('你好，世界'));
    });
    const provider = new OpenAICompatibleProvider({
      baseUrl: url,
      fetch,
      allowInsecureLoopback: true,
      getApiKey: async () => 'synthetic-contract-token',
    });
    expect(await collect(provider)).toEqual([
      { type: 'text_delta', text: '你好，世界' },
      { type: 'completed' },
    ]);
    expect(path).toBe('/v1/chat/completions');
    expect(authorization).toBe('Bearer synthetic-contract-token');
    expect(received).toMatchObject({
      stream: true,
      model: 'mock',
      max_tokens: 32,
      messages: [{ role: 'user', content: '你好' }],
    });
  });
  it.each([
    [401, 'auth'],
    [403, 'auth'],
    [429, 'rate_limit'],
    [500, 'provider'],
    [503, 'provider'],
  ])('maps HTTP %s without exposing response content', async (status, kind) => {
    const events = await collect(
      mocked('', { fetch: async () => new Response('sensitive-body', { status: Number(status) }) }),
    );
    expect(events).toEqual([{ type: 'error', kind, message: `Provider returned HTTP ${status}` }]);
    expect(JSON.stringify(events)).not.toContain('sensitive-body');
  });
  it('emits usage and a single completion with finish reason', async () => {
    const body = `data: ${delta('ok')}\n\ndata: {"choices":[{"delta":{},"finish_reason":"stop"}]}\n\ndata: {"choices":[],"usage":{"prompt_tokens":4,"completion_tokens":2}}\n\ndata: [DONE]\n\n`;
    expect(await collect(mocked(body))).toEqual([
      { type: 'text_delta', text: 'ok' },
      { type: 'usage', inputTokens: 4, outputTokens: 2 },
      { type: 'completed', finishReason: 'stop' },
    ]);
  });
  it('reports a disconnect rather than falsely completing', async () => {
    const events = await collect(mocked(`data: ${delta('partial')}\n\n`));
    expect(events.map((event) => event.type)).toEqual(['text_delta', 'error']);
    expect(events.at(-1)).toMatchObject({ kind: 'network' });
  });
  it.each([
    'not-json',
    '{"choices":[{"delta":{"content":42}}]}',
    '{"error":{"message":"private"}}',
    '{"choices":[],"usage":{"prompt_tokens":-1}}',
    '{}',
  ])('rejects malformed or unsupported data %s', async (payload) => {
    expect((await collect(mocked(`data: ${payload}\n\n`))).at(-1)).toMatchObject({
      type: 'error',
      kind: 'provider',
    });
  });
  it('rejects unsupported developer messages before calling the transport', async () => {
    let called = false;
    const provider = mocked('', {
      fetch: async () => {
        called = true;
        return new Response();
      },
    });
    const events = await Array.fromAsync(
      provider.stream(
        { ...request, messages: [{ id: 'd', role: 'developer', content: [] }] },
        new AbortController().signal,
      ),
    );
    expect(events).toMatchObject([{ type: 'error', kind: 'provider' }]);
    expect(called).toBe(false);
  });
  it('cancels after the first delta and never emits buffered subsequent text', async () => {
    const controller = new AbortController();
    const events: StreamEvent[] = [];
    for await (const event of mocked(
      `data: ${delta('first')}\n\ndata: ${delta('second')}\n\ndata: [DONE]\n\n`,
    ).stream(request, controller.signal)) {
      events.push(event);
      if (event.type === 'text_delta') controller.abort();
    }
    expect(events).toMatchObject([
      { type: 'text_delta', text: 'first' },
      { type: 'error', kind: 'abort' },
    ]);
  });
  it('does no I/O for an already aborted request', async () => {
    let called = false;
    const provider = mocked('', {
      fetch: async () => {
        called = true;
        return new Response();
      },
    });
    const controller = new AbortController();
    controller.abort();
    expect(await collect(provider, controller.signal)).toMatchObject([
      { type: 'error', kind: 'abort' },
    ]);
    expect(called).toBe(false);
  });
  it('aborts a pending HTTP request with a timeout classification', async () => {
    const url = await serverFor((_req, res) => {
      res.writeHead(200, { 'Content-Type': 'text/event-stream' });
      res.flushHeaders();
    });
    expect(
      await collect(
        new OpenAICompatibleProvider({
          baseUrl: url,
          fetch,
          allowInsecureLoopback: true,
          timeoutMs: 40,
        }),
      ),
    ).toMatchObject([{ type: 'error', kind: 'timeout' }]);
  });
  it('redacts raw transport errors and never automatically retries a generation', async () => {
    let calls = 0;
    const provider = mocked('', {
      fetch: async () => {
        calls++;
        throw new Error('private-token private-chat');
      },
    });
    expect(await collect(provider)).toEqual([
      { type: 'error', kind: 'network', message: 'Streaming request failed' },
    ]);
    expect(calls).toBe(1);
  });
  it('rejects a non-SSE success response', async () => {
    expect(
      await collect(
        mocked('', {
          fetch: async () =>
            new Response('{}', { headers: { 'Content-Type': 'application/json' } }),
        }),
      ),
    ).toMatchObject([{ type: 'error', kind: 'provider' }]);
  });
  it.each([
    'http://example.com/v1',
    'https://user:secret@example.com',
    'file:///private',
    'https://example.com?key=secret',
  ])('rejects unsafe endpoint %s', (baseUrl) => {
    expect(() => new OpenAICompatibleProvider({ baseUrl, fetch })).toThrow();
  });
  it.each(['http://example.com/v1', 'http://127.0.0.1.example.com/v1'])(
    'keeps remote cleartext blocked when the ADB loopback option is enabled: %s',
    (baseUrl) => {
      expect(
        () => new OpenAICompatibleProvider({ baseUrl, fetch, allowInsecureLoopback: true }),
      ).toThrow();
    },
  );
});
