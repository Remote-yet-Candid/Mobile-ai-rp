import { createServer } from 'node:http';
import { describe, expect, it } from 'vitest';
import { OpenAICompatibleProvider } from '../packages/provider-openai-compat/src/index.js';
import type { RPProvider } from '../packages/rp-provider/src/index.js';
import { runNetworkAcceptance } from '../apps/mobile/src/infra/network-acceptance.js';

describe('native acceptance runner', () => {
  it('checks real HTTP completion, socket cancellation and a clean subsequent request', async () => {
    let requests = 0;
    let interrupted = 0;
    const server = createServer(async (request, response) => {
      for await (const chunk of request) void chunk;
      requests++;
      response.writeHead(200, { 'Content-Type': 'text/event-stream' });
      let timer: ReturnType<typeof setTimeout>;
      let index = 0;
      const parts = ['你好', '，旅人', '。模拟流', '正在运行。'];
      const send = () => {
        if (index === parts.length) {
          response.end('data: [DONE]\n\n');
          return;
        }
        response.write(
          `data: ${JSON.stringify({ choices: [{ delta: { content: parts[index++] } }] })}\n\n`,
        );
        timer = setTimeout(send, 20);
      };
      response.on('close', () => {
        clearTimeout(timer);
        if (!response.writableFinished) interrupted++;
      });
      send();
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    try {
      const address = server.address();
      if (!address || typeof address === 'string') throw new Error('Missing address');
      const provider = new OpenAICompatibleProvider({
        baseUrl: `http://127.0.0.1:${address.port}/v1`,
        fetch,
        allowInsecureLoopback: true,
      });
      expect(await runNetworkAcceptance(provider, new AbortController().signal)).toEqual({
        completed: true,
        cancelledAfterFirstDelta: true,
        recovered: true,
      });
      expect(requests).toBe(3);
      expect(interrupted).toBe(1);
    } finally {
      server.closeAllConnections();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  it('rejects false cancellation from a transport that keeps emitting', async () => {
    const provider: RPProvider = {
      capabilities: async () => ({
        streaming: true,
        systemRole: true,
        developerRole: false,
        toolCalling: false,
      }),
      async *stream() {
        yield { type: 'text_delta', text: '你好，旅人。模拟流正在运行。' };
        yield { type: 'completed' };
      },
    };
    const result = await runNetworkAcceptance(provider, new AbortController().signal);
    expect(result.completed).toBe(true);
    expect(result.cancelledAfterFirstDelta).toBe(false);
    expect(result.recovered).toBe(true);
  });
});
