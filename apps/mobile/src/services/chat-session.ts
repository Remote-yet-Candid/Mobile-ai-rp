import type { RPProvider, RPMessage } from '@mobile-ai-rp/rp-provider';
import { prepareRoleplayRequest } from '@mobile-ai-rp/rp-core';
import type { AppStore } from '../infra/storage/app-store.js';
import type { ProviderProfile } from '../infra/model-profile.js';

export type PreparedTurn = ReturnType<typeof prepareRoleplayRequest> & {
  historyWindow: { maximum: number; omittedOlder: boolean; removedOrphan: boolean };
};
export type TurnResult = { status: 'complete' | 'cancelled' | 'failed'; errorCode?: string };
export class ChatInputError extends Error {
  constructor(
    readonly code: 'empty_message' | 'no_user_message' | 'context_budget' | 'missing_conversation',
  ) {
    super(code);
  }
}

/** App orchestration: native I/O is injected; RP Core remains pure and key-free. */
export async function runChatTurn(options: {
  store: AppStore;
  provider: RPProvider;
  profile: ProviderProfile;
  conversationId: string;
  mode: 'send' | 'regenerate';
  text?: string;
  signal: AbortSignal;
  id(): string;
  now(): number;
  onPrepared?(prepared: PreparedTurn): void;
  onUserSaved?(): void;
  onUpdate?(text: string): void;
}): Promise<TurnResult> {
  const { store, signal, conversationId } = options;
  if (signal.aborted) return { status: 'cancelled' };
  const conversation = await store.getConversation(conversationId);
  if (!conversation) throw new ChatInputError('missing_conversation');
  const card = await store.getCard(conversation.revisionId);
  if (!card) throw new ChatInputError('missing_conversation');
  let messages = await store.getActiveMessages(conversationId, 2000);
  let expectedLeafId = conversation.activeLeafId;
  if (options.mode === 'send') {
    const text = options.text?.trim();
    if (!text || text.length > 32000) throw new ChatInputError('empty_message');
    const message = await store.appendUser({
      conversationId,
      id: options.id(),
      text,
      now: options.now(),
      expectedLeafId,
    });
    expectedLeafId = message.id;
    options.onUserSaved?.();
    messages = await store.getActiveMessages(conversationId, 2000);
  } else if (messages.at(-1)?.role === 'assistant') {
    messages = messages.slice(0, -1);
  }
  const parent = messages.at(-1);
  if (!parent || parent.role !== 'user') throw new ChatInputError('no_user_message');
  const omittedOlder = messages[0]?.parentId != null;
  const removedOrphan = omittedOlder && messages[0]?.role === 'assistant';
  if (removedOrphan) messages = messages.slice(1);
  let prepared: PreparedTurn;
  try {
    const history: RPMessage[] = messages.map((message) => ({
      id: message.id,
      role: message.role,
      content: [{ type: 'text', text: message.text }],
    }));
    const data = card.data;
    const core = prepareRoleplayRequest({
      model: options.profile.model,
      character: {
        name: data.name,
        description: String(data.description ?? ''),
        personality: String(data.personality ?? ''),
        scenario: String(data.scenario ?? ''),
        first_mes: String(data.first_mes ?? ''),
        mes_example: String(data.mes_example ?? ''),
        system_prompt: String(data.system_prompt ?? ''),
        post_history_instructions: String(data.post_history_instructions ?? ''),
      },
      history,
      contextWindow: options.profile.contextWindow,
      maxOutputTokens: options.profile.maxOutputTokens,
      temperature: options.profile.temperature,
      userName: '旅人',
    });
    prepared = {
      ...core,
      historyWindow: { maximum: 2000, omittedOlder, removedOrphan },
      decision: {
        ...core.decision,
        warnings: [
          ...core.decision.warnings,
          ...(omittedOlder
            ? ['本次只加载最近 2000 条以内历史，更早记录仍保存在数据库；窗口边缘不完整轮次已排除。']
            : []),
        ],
      },
    };
  } catch {
    // The newly sent user message remains durable and can be retried after changing settings.
    throw new ChatInputError('context_budget');
  }
  options.onPrepared?.(prepared);
  if (signal.aborted) return { status: 'cancelled' };
  const generationId = options.id();
  await store.startGeneration({
    conversationId,
    id: generationId,
    messageId: options.id(),
    parentId: parent.id,
    expectedLeafId,
    now: options.now(),
  });
  let text = '';
  let status: TurnResult['status'] = 'failed';
  let errorCode = 'incomplete_stream';
  let chunks = 0;
  try {
    for await (const event of options.provider.stream(prepared.request, signal)) {
      if (signal.aborted) {
        status = 'cancelled';
        errorCode = 'abort';
        break;
      }
      if (event.type === 'text_delta') {
        if (text.length + event.text.length > 256000) {
          errorCode = 'response_limit';
          break;
        }
        text += event.text;
        options.onUpdate?.(text);
        if (++chunks % 8 === 0) await store.checkpointGeneration(generationId, text);
      } else if (event.type === 'completed') {
        status = text.trim() ? 'complete' : 'failed';
        errorCode = text.trim() ? '' : 'empty_response';
        break;
      } else if (event.type === 'error') {
        status = event.kind === 'abort' ? 'cancelled' : 'failed';
        errorCode = event.kind;
        break;
      }
    }
  } catch {
    status = signal.aborted ? 'cancelled' : 'failed';
    errorCode = signal.aborted ? 'abort' : 'network';
  }
  if (signal.aborted) {
    status = 'cancelled';
    errorCode = 'abort';
  }
  await store.finishGeneration(generationId, {
    status,
    text,
    ...(errorCode ? { errorCode } : {}),
  });
  return { status, ...(errorCode ? { errorCode } : {}) };
}

export function chatErrorText(error: unknown): string {
  if (error instanceof ChatInputError) {
    if (error.code === 'context_budget')
      return '角色设定或最新消息超出上下文预算。请调整模型上下文/输出预留后点重新请求；已发送消息仍保留。';
    if (error.code === 'no_user_message') return '请先发送一条消息，再重新生成回复。';
    if (error.code === 'empty_message') return '请输入 1–32000 个字符。';
  }
  return '操作未完成，已有记录不会被清空。请重开聊天后重试。';
}

export function generationErrorText(code?: string): string {
  const messages: Record<string, string> = {
    auth: '认证失败：请检查模型设置中的 API Key 和服务权限。',
    rate_limit: '服务限流，请稍后重新请求。',
    timeout: '请求超时，可重新请求。',
    network: '连接中断，请检查网络后重新请求。',
    provider: '模型服务返回错误或不支持当前流式协议，请检查设置。',
    response_limit: '回复超过本机读取上限，已停止并保留部分结果。',
    empty_response: '服务没有返回文本，请检查模型是否支持 Chat Completions 流式文本。',
  };
  return messages[code ?? ''] ?? '回复未完成，可重新请求；已有消息已保留。';
}
