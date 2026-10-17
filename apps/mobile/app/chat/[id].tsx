import { useEffect, useRef, useState, useCallback } from 'react';
import {
  FlatList,
  View,
  Text,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  Modal,
  ScrollView,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useRuntime } from '../../src/runtime';
import { newId } from '../../src/runtime';
import { Action, Heading, Screen, useTheme } from '../../src/components/ui';
import { MessageMarkdown } from '../../src/components/MessageMarkdown';
import { createConfiguredProvider } from '../../src/infra/secure-profile';
import type { ChatMessage, Conversation, Generation } from '../../src/infra/storage/app-store';
import {
  runChatTurn,
  chatErrorText,
  generationErrorText,
  type PreparedTurn,
} from '../../src/services/chat-session';

export default function Chat() {
  const { id: value } = useLocalSearchParams<{ id: string }>();
  const id = Array.isArray(value) ? (value[0] ?? '') : value;
  const { store, profiles } = useRuntime();
  const theme = useTheme();
  const router = useRouter();
  const [conversation, setConversation] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [attempts, setAttempts] = useState<Generation[]>([]);
  const [input, setInput] = useState('');
  const [status, setStatus] = useState('');
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [prepared, setPrepared] = useState<PreparedTurn | null>(null);
  const [inspect, setInspect] = useState(false);
  const [historyLimit, setHistoryLimit] = useState(100);
  const controller = useRef<AbortController | null>(null);
  const live = useRef(true);
  const currentViewId = useRef(id);
  currentViewId.current = id;
  const effectViewId = useRef(id);
  const refreshSequence = useRef(0);
  const list = useRef<FlatList<ChatMessage>>(null);
  const follow = useRef(true);
  const refresh = useCallback(async () => {
    const sequence = ++refreshSequence.current;
    const [chat, rows, generations] = await Promise.all([
      store.getConversation(id),
      store.getActiveMessages(id, historyLimit),
      store.listAttempts(id),
    ]);
    if (live.current && currentViewId.current === id && sequence === refreshSequence.current) {
      setConversation(chat);
      setMessages(rows);
      setAttempts(generations);
    }
  }, [id, store, historyLimit]);
  useEffect(() => {
    live.current = true;
    if (effectViewId.current !== id) {
      controller.current?.abort();
      controller.current = null;
      setBusy(false);
      setDraft('');
      setInput('');
      setPrepared(null);
      setStatus('');
      effectViewId.current = id;
    }
    void refresh().catch(() => {
      if (live.current && currentViewId.current === id) setStatus('聊天读取失败，原有数据已保留。');
    });
    return () => {
      live.current = false;
      controller.current?.abort();
    };
  }, [refresh]);
  async function generate(mode: 'send' | 'regenerate') {
    if (controller.current) return;
    const active = new AbortController();
    controller.current = active;
    const visible = () =>
      live.current && currentViewId.current === id && controller.current === active;
    setBusy(true);
    setDraft('');
    setStatus('准备请求…');
    follow.current = true;
    try {
      const profile = await profiles.load();
      if (!profile) {
        if (visible()) setStatus('请先打开模型设置，填写 Base URL、模型和 API Key。');
        return;
      }
      if (active.signal.aborted) return;
      const text = input;
      const result = await runChatTurn({
        store,
        provider: createConfiguredProvider(profile, profiles),
        profile,
        conversationId: id,
        mode,
        ...(mode === 'send' ? { text } : {}),
        signal: active.signal,
        id: newId,
        now: Date.now,
        onUserSaved: () => {
          if (visible()) {
            setInput('');
            void refresh().catch(() => {});
          }
        },
        onPrepared: (request) => {
          if (visible()) {
            setPrepared(request);
            setStatus('正在生成…');
            void refresh().catch(() => {});
          }
        },
        onUpdate: (text) => {
          if (visible()) setDraft(text);
        },
      });
      if (visible()) {
        setStatus(
          result.status === 'complete'
            ? '回复已保存'
            : result.status === 'cancelled'
              ? '已停止；部分回复保留为尝试，原有消息不变。'
              : generationErrorText(result.errorCode),
        );
      }
    } catch (error) {
      if (visible()) setStatus(chatErrorText(error));
    } finally {
      const updateView = visible();
      if (controller.current === active) controller.current = null;
      if (updateView) {
        setBusy(false);
        setDraft('');
        await refresh().catch(() => {});
      }
    }
  }
  const last = messages.at(-1);
  const parentId = last?.role === 'assistant' ? last.parentId : last?.id;
  const siblings = attempts.filter(
    (attempt) => attempt.parentId === parentId && attempt.status === 'complete',
  );
  const incomplete = attempts.filter(
    (attempt) => attempt.status !== 'complete' && attempt.status !== 'streaming',
  );
  return (
    <Screen>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <Heading
          title={conversation?.title.slice(0, 100) ?? '聊天'}
          subtitle="单角色 RP · 流式文本 · 本机保存"
        >
          <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
            <Action label="角色列表" secondary onPress={() => router.replace('/')} />
            <Action
              label="模型设置"
              secondary
              disabled={busy}
              onPress={() => router.push('/settings')}
            />
            <Action
              label="上下文检查"
              secondary
              disabled={!prepared}
              onPress={() => setInspect(true)}
            />
          </View>
        </Heading>
        <FlatList
          ref={list}
          data={messages}
          keyExtractor={(item) => item.id}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          contentContainerStyle={{ padding: 16, gap: 14, flexGrow: 1 }}
          scrollEventThrottle={100}
          onScroll={(event) => {
            const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent;
            follow.current = contentSize.height - contentOffset.y - layoutMeasurement.height < 140;
          }}
          onContentSizeChange={() => {
            if (follow.current) list.current?.scrollToEnd({ animated: false });
          }}
          ListHeaderComponent={
            messages.length >= historyLimit ? (
              <Action
                label="加载更早记录"
                secondary
                disabled={busy || historyLimit >= 2000}
                onPress={() => {
                  follow.current = false;
                  setHistoryLimit((n) => Math.min(2000, n + 100));
                }}
              />
            ) : (
              <View />
            )
          }
          ListEmptyComponent={
            <Text style={{ color: theme.muted }}>发送第一条消息，开始与你的角色互动。</Text>
          }
          renderItem={({ item }) => (
            <View
              style={{
                padding: 14,
                borderRadius: 14,
                backgroundColor: item.role === 'user' ? theme.background : theme.surface,
                borderWidth: 1,
                borderColor: theme.line,
                gap: 7,
              }}
            >
              <Text style={{ color: theme.accent, fontWeight: '700' }}>
                {item.role === 'user' ? '旅人' : '角色'}
              </Text>
              <MessageMarkdown text={item.text} />
            </View>
          )}
          ListFooterComponent={
            <View style={{ gap: 12 }}>
              {busy && (
                <View
                  style={{ backgroundColor: theme.surface, borderRadius: 14, padding: 14, gap: 8 }}
                >
                  <Text style={{ color: theme.accent }}>正在生成新回复…</Text>
                  <MessageMarkdown text={draft || '等待模型返回…'} />
                </View>
              )}
              {siblings.length > 1 && (
                <View style={{ gap: 8 }}>
                  <Text style={{ color: theme.muted }}>回复候选（旧回复保留）</Text>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                    {siblings.map((attempt, index) => (
                      <Action
                        key={attempt.id}
                        label={`候选 ${index + 1}${conversation?.activeLeafId === attempt.messageId ? ' ✓' : ''}`}
                        secondary
                        disabled={busy}
                        onPress={() => {
                          if (!conversation) return;
                          void store
                            .selectCandidate({
                              conversationId: id,
                              messageId: attempt.messageId,
                              expectedLeafId: conversation.activeLeafId,
                            })
                            .then(refresh)
                            .catch(() => setStatus('候选切换失败，请重开聊天后重试。'));
                        }}
                      />
                    ))}
                  </View>
                </View>
              )}
              {incomplete.slice(-3).map((attempt) => (
                <View
                  key={attempt.id}
                  style={{ borderColor: theme.line, borderWidth: 1, padding: 12, borderRadius: 12 }}
                >
                  <Text style={{ color: theme.muted }}>
                    未完成的尝试 · {attempt.status}（不加入默认上下文）
                  </Text>
                  <Text selectable style={{ color: theme.text }}>
                    {attempt.text.slice(0, 4000) || '没有收到文本'}
                  </Text>
                </View>
              ))}
            </View>
          }
        />
        <View style={{ padding: 12, borderTopWidth: 1, borderColor: theme.line, gap: 9 }}>
          <Text accessibilityLiveRegion="polite" style={{ color: theme.muted, fontSize: 13 }}>
            {status}
          </Text>
          <TextInput
            accessibilityLabel="消息输入"
            placeholder="对角色说些什么…"
            placeholderTextColor={theme.muted}
            multiline
            maxLength={32000}
            value={input}
            onChangeText={setInput}
            editable={!busy}
            style={{
              color: theme.text,
              backgroundColor: theme.surface,
              borderColor: theme.line,
              borderWidth: 1,
              borderRadius: 12,
              padding: 12,
              fontSize: 16,
              maxHeight: 140,
              minHeight: 48,
            }}
          />
          <View style={{ flexDirection: 'row', gap: 10 }}>
            {busy ? (
              <Action
                label="停止生成"
                onPress={() => {
                  controller.current?.abort();
                  setStatus('正在停止…');
                }}
              />
            ) : (
              <>
                <Action
                  label="发送"
                  disabled={!input.trim() || !conversation}
                  onPress={() => void generate('send')}
                />
                <Action
                  label="重新生成 / 重试"
                  secondary
                  disabled={!conversation || !parentId}
                  onPress={() => void generate('regenerate')}
                />
              </>
            )}
          </View>
        </View>
      </KeyboardAvoidingView>
      <Modal visible={inspect} animationType="slide" onRequestClose={() => setInspect(false)}>
        <Screen>
          <Heading title="本次上下文" subtitle="仅保留在当前页面内存；不含 API Key">
            <Action label="关闭" onPress={() => setInspect(false)} />
          </Heading>
          <ScrollView contentContainerStyle={{ padding: 18, gap: 14 }}>
            <Text style={{ color: theme.text }}>
              输入估算 {prepared?.decision.inputTokens} / 预算 {prepared?.decision.inputBudget}{' '}
              tokens。包含 {prepared?.inspection.includedMessageIds.length} 条历史，排除{' '}
              {prepared?.inspection.droppedMessageIds.length} 条较旧消息。估算不等于模型真实分词。
            </Text>
            <Text style={{ color: theme.muted }}>{prepared?.decision.warnings.join('\n')}</Text>
            <Text selectable style={{ color: theme.text, fontFamily: 'monospace', fontSize: 12 }}>
              {JSON.stringify(prepared?.inspection, null, 2)}
            </Text>
            <Text accessibilityRole="header" style={{ color: theme.accent, fontSize: 18 }}>
              实际请求预览（个人聊天内容，请勿公开分享）
            </Text>
            <Text selectable style={{ color: theme.text, fontFamily: 'monospace', fontSize: 12 }}>
              {JSON.stringify(prepared?.request, null, 2)}
            </Text>
          </ScrollView>
        </Screen>
      </Modal>
    </Screen>
  );
}
