import { createServer } from 'node:http';

const intervalMs = Number(process.env.MOCK_INTERVAL_MS ?? 100);
if (!Number.isSafeInteger(intervalMs) || intervalMs < 10 || intervalMs > 10000) {
  throw new RangeError('MOCK_INTERVAL_MS must be an integer between 10 and 10000');
}

const server = createServer(async (request, response) => {
  if (request.method === 'GET' && request.url === '/health') {
    response.writeHead(200, { 'Content-Type': 'application/json' });
    response.end('{"status":"ok","fixture":"synthetic-only"}');
    return;
  }
  if (request.method !== 'POST' || request.url !== '/v1/chat/completions') {
    response.writeHead(404).end();
    return;
  }
  let bytes = 0;
  for await (const chunk of request) {
    bytes += chunk.length;
    if (bytes > 65536) {
      response.writeHead(413).end();
      return;
    }
  }
  response.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' });
  const parts = ['你好', '，旅人', '。模拟流', '正在运行。'];
  let index = 0;
  let timer;
  const send = () => {
    if (index === parts.length) {
      response.end('data: [DONE]\n\n');
      return;
    }
    response.write(
      `data: ${JSON.stringify({ choices: [{ delta: { content: parts[index++] } }] })}\n\n`,
    );
    timer = setTimeout(send, intervalMs);
  };
  response.on('close', () => clearTimeout(timer));
  send();
});
const port = Number(process.env.MOCK_PORT ?? 8787);
server.listen(port, '127.0.0.1', () =>
  console.log(`Synthetic SSE server listening on loopback port ${port}`),
);
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => server.close());
