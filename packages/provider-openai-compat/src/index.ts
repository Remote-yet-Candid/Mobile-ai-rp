import type {
  ProviderErrorKind,
  RPProvider,
  RPRequest,
  StreamEvent,
} from '@mobile-ai-rp/rp-provider';

class StreamFailure extends Error {
  constructor(
    readonly kind: ProviderErrorKind,
    message: string,
  ) {
    super(message);
  }
}

/** Incremental SSE framing with bounded metadata; UTF-8 may split between chunks. */
export async function* readSseData(
  body: ReadableStream<Uint8Array>,
  signal: AbortSignal,
  maxEventBytes = 1024 * 1024,
): AsyncIterable<string> {
  const reader = body.getReader();
  const decoder = new TextDecoder('utf-8', { fatal: true });
  const encoder = new TextEncoder();
  let buffer = '';
  let data: string[] = [];
  let size = 0;
  const abort = () => void reader.cancel().catch(() => {});
  signal.addEventListener('abort', abort, { once: true });
  try {
    while (true) {
      if (signal.aborted) throw new StreamFailure('abort', 'Generation cancelled');
      const chunk = await reader.read();
      if (signal.aborted) throw new StreamFailure('abort', 'Generation cancelled');
      buffer += chunk.done ? decoder.decode() : decoder.decode(chunk.value, { stream: true });
      // A terminal CR is itself a line terminator; adding LF handles it as CRLF.
      if (chunk.done && buffer.endsWith('\r')) buffer += '\n';
      while (true) {
        const end = buffer.search(/[\r\n]/);
        if (end < 0 || (buffer[end] === '\r' && end === buffer.length - 1)) break;
        const line = buffer.slice(0, end);
        const separator = buffer[end] === '\r' && buffer[end + 1] === '\n' ? 2 : 1;
        buffer = buffer.slice(end + separator);
        size += encoder.encode(line).byteLength;
        if (size > maxEventBytes) throw new StreamFailure('provider', 'SSE event exceeds limit');
        if (line === '') {
          if (data.length > 0) yield data.join('\n');
          data = [];
          size = 0;
        } else if (line.startsWith('data:')) {
          data.push(line.slice(5).replace(/^ /, ''));
        } else if (line === 'data') {
          data.push('');
        }
      }
      if (size + encoder.encode(buffer).byteLength > maxEventBytes) {
        throw new StreamFailure('provider', 'SSE event exceeds limit');
      }
      if (chunk.done) break;
    }
  } finally {
    signal.removeEventListener('abort', abort);
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}

function record(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new StreamFailure('provider', 'Invalid streaming response');
  }
  return value as Record<string, unknown>;
}

/** Structural streaming port: native implementations need not use the global Response class. */
export type StreamingResponse = Readonly<{
  ok: boolean;
  status: number;
  headers: Pick<Headers, 'get'>;
  body: ReadableStream<Uint8Array> | null;
}>;
export type StreamingFetch = (url: string, init: RequestInit) => Promise<StreamingResponse>;

export type OpenAICompatibleOptions = Readonly<{
  baseUrl: string;
  fetch: StreamingFetch;
  getApiKey?: () => Promise<string | undefined>;
  timeoutMs?: number;
  /** Development only: explicitly permit loopback HTTP, never arbitrary cleartext hosts. */
  allowInsecureLoopback?: boolean;
  maxEventBytes?: number;
}>;

/** Public text chat-completions SSE subset only; not universal provider compatibility. */
export class OpenAICompatibleProvider implements RPProvider {
  private readonly endpoint: URL;
  constructor(private readonly options: OpenAICompatibleOptions) {
    const url = new URL(options.baseUrl);
    const loopback = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
    if (
      (url.protocol !== 'https:' &&
        !(url.protocol === 'http:' && loopback && options.allowInsecureLoopback)) ||
      url.username ||
      url.password ||
      url.search ||
      url.hash
    ) {
      throw new TypeError('Use an HTTPS endpoint without embedded credentials, query or fragment');
    }
    url.pathname = `${url.pathname.replace(/\/$/, '')}/chat/completions`;
    this.endpoint = url;
    if (
      options.timeoutMs !== undefined &&
      (!Number.isFinite(options.timeoutMs) || options.timeoutMs <= 0)
    ) {
      throw new RangeError('timeoutMs must be positive');
    }
  }

  async capabilities() {
    return { streaming: true, systemRole: true, developerRole: false, toolCalling: false };
  }

  async *stream(request: RPRequest, signal: AbortSignal): AsyncIterable<StreamEvent> {
    const controller = new AbortController();
    let timedOut = false;
    const abort = () => controller.abort();
    signal.addEventListener('abort', abort, { once: true });
    if (signal.aborted) abort();
    const timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, this.options.timeoutMs ?? 30000);
    try {
      if (controller.signal.aborted) throw new StreamFailure('abort', 'Generation cancelled');
      if (request.messages.some((message) => message.role === 'developer')) {
        throw new StreamFailure('provider', 'Developer role is outside this adapter subset');
      }
      if (
        !Number.isSafeInteger(request.generation.maxOutputTokens) ||
        request.generation.maxOutputTokens <= 0
      ) {
        throw new StreamFailure('provider', 'Invalid output token reservation');
      }
      const apiKey = await this.options.getApiKey?.();
      if (controller.signal.aborted) throw new StreamFailure('abort', 'Generation cancelled');
      const response = await this.options.fetch(this.endpoint.toString(), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'text/event-stream',
          ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
        },
        body: JSON.stringify({
          model: request.model,
          messages: request.messages.map((message) => ({
            role: message.role,
            content: message.content.map((part) => part.text).join(''),
          })),
          stream: true,
          max_tokens: request.generation.maxOutputTokens,
          ...(request.generation.temperature === undefined
            ? {}
            : { temperature: request.generation.temperature }),
        }),
        signal: controller.signal,
        redirect: 'error',
      });
      if (!response.ok) {
        await response.body?.cancel().catch(() => {});
        const kind =
          response.status === 401 || response.status === 403
            ? 'auth'
            : response.status === 429
              ? 'rate_limit'
              : 'provider';
        throw new StreamFailure(kind, `Provider returned HTTP ${response.status}`);
      }
      if (
        !response.headers.get('content-type')?.toLowerCase().includes('text/event-stream') ||
        !response.body
      ) {
        await response.body?.cancel().catch(() => {});
        throw new StreamFailure('provider', 'Expected a readable text/event-stream response');
      }
      let finishReason: string | undefined;
      for await (const data of readSseData(
        response.body,
        controller.signal,
        this.options.maxEventBytes,
      )) {
        if (controller.signal.aborted) throw new StreamFailure('abort', 'Generation cancelled');
        if (data === '[DONE]') {
          yield { type: 'completed', ...(finishReason === undefined ? {} : { finishReason }) };
          return;
        }
        let value: unknown;
        try {
          value = JSON.parse(data);
        } catch {
          throw new StreamFailure('provider', 'Malformed JSON in streaming response');
        }
        const payload = record(value);
        if (payload.error !== undefined) {
          throw new StreamFailure('provider', 'Provider reported a streaming error');
        }
        if (payload.usage !== undefined && payload.usage !== null) {
          const usage = record(payload.usage);
          const inputTokens = usage.prompt_tokens;
          const outputTokens = usage.completion_tokens;
          if (
            [inputTokens, outputTokens].some(
              (count) =>
                count !== undefined &&
                (typeof count !== 'number' || !Number.isSafeInteger(count) || count < 0),
            )
          ) {
            throw new StreamFailure('provider', 'Invalid usage counts');
          }
          yield {
            type: 'usage',
            ...(typeof inputTokens === 'number' ? { inputTokens } : {}),
            ...(typeof outputTokens === 'number' ? { outputTokens } : {}),
          };
        }
        if (!Array.isArray(payload.choices)) {
          throw new StreamFailure('provider', 'Missing streaming choices');
        }
        if (payload.choices.length === 0) continue;
        const choice = record(payload.choices[0]);
        const delta = record(choice.delta);
        if (delta.content !== undefined && delta.content !== null) {
          if (typeof delta.content !== 'string') {
            throw new StreamFailure('provider', 'Non-text delta is unsupported');
          }
          yield { type: 'text_delta', text: delta.content };
        }
        if (choice.finish_reason !== undefined && choice.finish_reason !== null) {
          if (typeof choice.finish_reason !== 'string') {
            throw new StreamFailure('provider', 'Invalid finish reason');
          }
          finishReason = choice.finish_reason;
        }
      }
      throw new StreamFailure('network', 'Stream ended before [DONE]');
    } catch (error) {
      const kind: ProviderErrorKind = signal.aborted
        ? 'abort'
        : timedOut
          ? 'timeout'
          : error instanceof StreamFailure
            ? error.kind
            : 'network';
      // Never emit raw exception messages, response bodies, endpoint URLs or API keys.
      const message = error instanceof StreamFailure ? error.message : 'Streaming request failed';
      yield { type: 'error', kind, message };
    } finally {
      clearTimeout(timer);
      signal.removeEventListener('abort', abort);
      controller.abort();
    }
  }
}
