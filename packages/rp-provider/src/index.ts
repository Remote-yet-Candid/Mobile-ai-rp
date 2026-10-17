export type MessageRole = 'system' | 'developer' | 'user' | 'assistant';
export type RPContent = Readonly<{ type: 'text'; text: string }>;
export type RPMessage = Readonly<{
  id: string;
  role: MessageRole;
  content: readonly RPContent[];
}>;
export type ProviderCapabilities = Readonly<{
  streaming: boolean;
  systemRole: boolean;
  developerRole: boolean;
  toolCalling: boolean;
  contextWindow?: number;
}>;
export type RPRequest = Readonly<{
  model: string;
  messages: readonly RPMessage[];
  generation: Readonly<{ maxOutputTokens: number; temperature?: number }>;
}>;
export type ProviderErrorKind =
  'auth' | 'rate_limit' | 'network' | 'timeout' | 'provider' | 'abort';
export type StreamEvent =
  | { type: 'text_delta'; text: string }
  | { type: 'usage'; inputTokens?: number; outputTokens?: number }
  | { type: 'completed'; finishReason?: string }
  | { type: 'error'; kind: ProviderErrorKind; message: string };
export interface RPProvider {
  capabilities(): Promise<ProviderCapabilities>;
  stream(request: RPRequest, signal: AbortSignal): AsyncIterable<StreamEvent>;
}
