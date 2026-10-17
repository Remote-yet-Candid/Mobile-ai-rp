import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, useColorScheme, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { FlashList } from '@shopify/flash-list';
import { prepareRequest } from '@mobile-ai-rp/rp-core';
import { OpenAICompatibleProvider } from '@mobile-ai-rp/provider-openai-compat';
import { createMockStreamFetch, createProbeMessages } from '@mobile-ai-rp/test-fixtures';
import type { ProbeMessage } from '@mobile-ai-rp/storage-contracts';
import { createSQLiteProbeStore } from '../src/infra/storage/sqlite';

export default function GateZeroLab() {
  const dark = useColorScheme() === 'dark';
  const background = dark ? '#151820' : '#f7f5f0';
  const foreground = dark ? '#f4f0e8' : '#20232b';
  const store = useRef<Awaited<ReturnType<typeof createSQLiteProbeStore>> | null>(null);
  const controller = useRef<AbortController | null>(null);
  const mounted = useRef(true);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [rows, setRows] = useState<ProbeMessage[]>([]);
  const [hasEarlier, setHasEarlier] = useState(true);
  const [status, setStatus] = useState('正在打开本地验证数据库…');
  const [streaming, setStreaming] = useState(false);
  const [output, setOutput] = useState('');

  useEffect(() => {
    mounted.current = true;
    let disposed = false;
    let ownedStore: Awaited<ReturnType<typeof createSQLiteProbeStore>> | null = null;
    void createSQLiteProbeStore()
      .then(async (opened) => {
        if (disposed) {
          await opened.close();
          return;
        }
        ownedStore = opened;
        store.current = opened;
        const existing = await opened.page({ limit: 50 });
        if (!disposed) {
          setRows(existing);
          setHasEarlier(existing.length === 50);
          setReady(true);
          setStatus('就绪 · 仅合成数据，可关闭后重开验证持久化');
        }
      })
      .catch(() => {
        if (!disposed) setStatus('数据库打开失败；请记录设备与操作步骤');
      });
    return () => {
      disposed = true;
      mounted.current = false;
      controller.current?.abort();
      store.current = null;
      void ownedStore?.close();
    };
  }, []);

  async function load(seed: boolean) {
    if (!store.current || busy) return;
    setBusy(true);
    try {
      if (seed) await store.current.seed(createProbeMessages(1000));
      const started = performance.now();
      const before = seed ? undefined : rows[0]?.sequence;
      const page = await store.current.page({
        limit: 50,
        ...(before === undefined ? {} : { before }),
      });
      if (!mounted.current) return;
      setRows((previous) => (seed ? page : [...page, ...previous]));
      setHasEarlier(page.length === 50);
      setStatus(
        `分页 ${page.length} 条 · ${(performance.now() - started).toFixed(1)} ms（非正式基准）`,
      );
    } catch {
      if (mounted.current) setStatus('分页或写入失败；原有数据未被重置');
    } finally {
      if (mounted.current) setBusy(false);
    }
  }

  async function startStream() {
    const active = new AbortController();
    controller.current?.abort();
    controller.current = active;
    setStreaming(true);
    setOutput('');
    const provider = new OpenAICompatibleProvider({
      baseUrl: 'https://gate0.invalid/v1',
      fetch: createMockStreamFetch(),
    });
    try {
      const prepared = prepareRequest(
        {
          model: 'synthetic-probe',
          messages: [{ id: 'probe', role: 'user', content: [{ type: 'text', text: '你好' }] }],
          generation: { maxOutputTokens: 32 },
        },
        { contextWindow: 256, safetyMargin: 16 },
        {
          // Known synthetic fixture measurement only, never used for real model estimates.
          measure: () => ({ tokens: 32, accuracy: 'estimate' }),
        },
      );
      for await (const event of provider.stream(prepared.request, active.signal)) {
        if (!mounted.current || active.signal.aborted || controller.current !== active) break;
        if (event.type === 'text_delta') setOutput((previous) => previous + event.text);
        if (event.type === 'error') setStatus(`模拟流错误：${event.kind}`);
        if (event.type === 'completed') setStatus('模拟流完成 · 未进行真实 API 调用');
      }
    } finally {
      if (controller.current === active) {
        controller.current = null;
        if (mounted.current) setStreaming(false);
      }
    }
  }

  function stopStream() {
    controller.current?.abort();
    setStreaming(false);
    setStatus('已取消；后续片段不再累加');
  }

  function button(label: string, action: () => void, disabled = false) {
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label}
        disabled={disabled}
        onPress={action}
        style={[styles.button, { opacity: disabled ? 0.4 : 1 }]}
      >
        <Text style={styles.buttonText}>{label}</Text>
      </Pressable>
    );
  }

  return (
    <SafeAreaView style={[styles.screen, { backgroundColor: background }]}>
      <Text accessibilityRole="header" style={[styles.title, { color: foreground }]}>
        Mobile AI RP · Gate 0
      </Text>
      <Text style={{ color: foreground }}>
        技术验证壳 · SQLite / FlashList / SSE · 不代表正式产品
      </Text>
      <View style={styles.actions}>
        {button('准备 1000 条合成消息', () => void load(true), !ready || busy)}
        {button(
          '加载更早的 50 条',
          () => void load(false),
          !ready || busy || !hasEarlier || rows.length === 0,
        )}
      </View>
      <Text accessibilityLiveRegion="polite" style={{ color: foreground }}>
        {status}
      </Text>
      <Text style={{ color: foreground }}>
        已加载 {rows.length} 条；长消息占 10%。真机性能尚待记录。
      </Text>
      <View style={styles.list}>
        <FlashList
          data={rows}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <View style={styles.message}>
              <Text style={{ color: foreground }}>
                {item.role} · #{item.sequence}
              </Text>
              <Text selectable style={{ color: foreground }}>
                {item.text}
              </Text>
            </View>
          )}
        />
      </View>
      <Text style={{ color: foreground }}>模拟 SSE（进程内；不访问网络、不需要密钥）：</Text>
      <Text
        selectable
        accessibilityLiveRegion="polite"
        style={[styles.output, { color: foreground }]}
      >
        {output || '尚未开始'}
      </Text>
      <View style={styles.actions}>
        {button('开始模拟流', () => void startStream(), streaming)}
        {button('停止生成', stopStream, !streaming)}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, paddingHorizontal: 16, gap: 8 },
  title: { fontSize: 22, fontWeight: '700' },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  button: { backgroundColor: '#315f73', borderRadius: 8, padding: 12 },
  buttonText: { color: '#ffffff', fontSize: 15 },
  list: { flex: 1, minHeight: 100 },
  message: {
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: '#a0a0a0',
  },
  output: { minHeight: 44 },
});
