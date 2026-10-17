import { useEffect, useRef, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useColorScheme,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Link } from 'expo-router';
import { prepareRequest } from '@mobile-ai-rp/rp-core';
import { CardImportError } from '@mobile-ai-rp/rp-card-codecs';
import { createNativeNetworkProbe } from '../src/infra/provider';
import { pickProbeCard } from '../src/infra/card-import';

export default function GateZeroTools() {
  const dark = useColorScheme() === 'dark';
  const foreground = dark ? '#f4f0e8' : '#20232b';
  const background = dark ? '#151820' : '#f7f5f0';
  const mounted = useRef(true);
  const controller = useRef<AbortController | null>(null);
  const [endpoint, setEndpoint] = useState('');
  const [running, setRunning] = useState(false);
  const [importing, setImporting] = useState(false);
  const [networkStatus, setNetworkStatus] = useState('未运行；不发送密钥或真实聊天');
  const [cardStatus, setCardStatus] = useState('未选择卡片；不会加载图片、外链或执行卡片脚本');
  const [output, setOutput] = useState('');
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      controller.current?.abort();
    };
  }, []);

  async function startNetwork() {
    const active = new AbortController();
    controller.current?.abort();
    controller.current = active;
    setRunning(true);
    setOutput('');
    setNetworkStatus('正在连接 HTTPS 模拟服务…');
    try {
      const provider = createNativeNetworkProbe(endpoint.trim());
      const snapshot = prepareRequest(
        {
          model: 'synthetic-probe',
          messages: [
            {
              id: 'probe',
              role: 'user',
              content: [{ type: 'text', text: 'Synthetic Gate 0 network probe.' }],
            },
          ],
          generation: { maxOutputTokens: 32 },
        },
        { contextWindow: 256, safetyMargin: 16 },
        {
          measure: () => ({ tokens: 32, accuracy: 'estimate' }),
        },
      );
      for await (const event of provider.stream(snapshot.request, active.signal)) {
        if (!mounted.current || active.signal.aborted || controller.current !== active) break;
        if (event.type === 'text_delta') setOutput((previous) => previous + event.text);
        if (event.type === 'error') setNetworkStatus(`网络验证失败：${event.kind}`);
        if (event.type === 'completed')
          setNetworkStatus('网络流已完成；请记录设备、时延和操作结果');
      }
    } catch {
      if (mounted.current && controller.current === active)
        setNetworkStatus('无法开始：使用不含凭据、query 或 fragment 的 HTTPS Base URL');
    } finally {
      if (controller.current === active) {
        controller.current = null;
        if (mounted.current) setRunning(false);
      }
    }
  }
  function cancel() {
    controller.current?.abort();
    setRunning(false);
    setNetworkStatus('已取消；不再累加后续片段');
  }
  async function importCard() {
    if (importing) return;
    setImporting(true);
    try {
      const card = await pickProbeCard();
      if (mounted.current && card) {
        const name = card.document.data.name.replace(/\s+/g, ' ').slice(0, 80);
        setCardStatus(
          `${name} · ${card.document.spec} · ${card.source}\n${card.warnings.join('；') || '基础读取通过'}\n仅本次验证，不持久化；Lorebook/宏行为尚未验证。`,
        );
      }
    } catch (error) {
      if (mounted.current)
        setCardStatus(
          `卡片读取失败：${error instanceof CardImportError ? error.code : 'file_read_failed'}`,
        );
    } finally {
      if (mounted.current) setImporting(false);
    }
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
      <KeyboardAvoidingView
        style={styles.screen}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <Link href="/" style={{ color: foreground }}>
            ← 返回 SQLite / FlashList 验证
          </Link>
          <Text accessibilityRole="header" style={[styles.title, { color: foreground }]}>
            Gate 0 · 网络与卡片
          </Text>
          <Text style={{ color: foreground }}>
            使用你信任的 HTTPS SSE 模拟服务。网络适配器使用 expo/fetch；没有真机结果前不标记通过。
          </Text>
          <TextInput
            accessibilityLabel="HTTPS 模拟服务 Base URL"
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
            placeholder="https://your-mock.example/v1"
            placeholderTextColor={dark ? '#aaaaaa' : '#555555'}
            value={endpoint}
            onChangeText={setEndpoint}
            editable={!running}
            style={[styles.input, { color: foreground, borderColor: foreground }]}
          />
          {button('开始 HTTPS 网络流', () => void startNetwork(), running || !endpoint.trim())}
          {button('取消网络流', cancel, !running)}
          <Text accessibilityLiveRegion="polite" style={{ color: foreground }}>
            {networkStatus}
          </Text>
          <Text selectable style={{ color: foreground }}>
            {output || '尚无网络片段'}
          </Text>
          <Text accessibilityRole="header" style={[styles.title, { color: foreground }]}>
            卡片 JSON / PNG
          </Text>
          <Text style={{ color: foreground }}>
            8 MiB 文件 / 1 MiB JSON 限制；PNG 校验 CRC 并优先选择 ccv3。选择你有权使用的卡片。
          </Text>
          {button('选择本地 JSON / PNG 卡片', () => void importCard(), importing)}
          <Text selectable accessibilityLiveRegion="polite" style={{ color: foreground }}>
            {cardStatus}
          </Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: { padding: 16, gap: 12 },
  title: { fontSize: 21, fontWeight: '700' },
  input: { borderWidth: 1, borderRadius: 8, padding: 12, minHeight: 48 },
  button: { backgroundColor: '#315f73', borderRadius: 8, padding: 12 },
  buttonText: { color: '#ffffff', fontSize: 15 },
});
