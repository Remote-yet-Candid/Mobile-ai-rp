import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import {
  DEFAULT_PROFILE,
  ProfileError,
  type ProfileService,
  type ProviderProfile,
} from '../infra/model-profile';

export function ModelSettings({
  service,
  onSaved,
}: {
  service: ProfileService;
  onSaved?: (profile: ProviderProfile) => void | Promise<void>;
}) {
  const [profile, setProfile] = useState<ProviderProfile>(DEFAULT_PROFILE);
  const [contextWindow, setContextWindow] = useState(String(DEFAULT_PROFILE.contextWindow));
  const [maxOutputTokens, setMaxOutputTokens] = useState(String(DEFAULT_PROFILE.maxOutputTokens));
  const [temperature, setTemperature] = useState(String(DEFAULT_PROFILE.temperature));
  const [apiKey, setApiKey] = useState('');
  const [hasKey, setHasKey] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    let mounted = true;
    void (async () => {
      try {
        const existing = await service.load();
        const keyPresent = existing ? await service.hasKey(existing.id, existing.baseUrl) : false;
        if (!mounted) return;
        if (existing) {
          setProfile(existing);
          setContextWindow(String(existing.contextWindow));
          setMaxOutputTokens(String(existing.maxOutputTokens));
          setTemperature(String(existing.temperature));
        }
        setHasKey(keyPresent);
      } catch (error) {
        if (mounted) {
          setMessage(error instanceof ProfileError ? error.message : '模型设置读取失败。');
        }
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [service]);

  async function save(clearKey = false) {
    setSaving(true);
    setMessage('');
    try {
      const saved = await service.save(
        {
          ...profile,
          contextWindow: Number(contextWindow),
          maxOutputTokens: Number(maxOutputTokens),
          temperature: Number(temperature),
        },
        clearKey ? { clearKey: true } : { apiKey },
      );
      setProfile(saved);
      const keyPresent = await service.hasKey(saved.id, saved.baseUrl);
      setHasKey(keyPresent);
      setMessage(
        keyPresent
          ? '配置已保存，API Key 位于系统安全存储。尚未测试真实模型连接。'
          : '配置已保存，当前未保存 API Key；需要认证的服务请填写密钥后再次保存。',
      );
      await onSaved?.(saved);
    } catch (error) {
      setMessage(error instanceof ProfileError ? error.message : '保存失败，请重试。');
    } finally {
      // The stored secret is never reloaded into this input or rendered in the screen.
      setApiKey('');
      setSaving(false);
    }
  }

  if (loading) return <ActivityIndicator accessibilityLabel="读取模型配置" />;
  const disabled = loading || saving;
  return (
    <View style={styles.container}>
      <Text style={styles.title}>模型连接</Text>
      <Text style={styles.hint}>
        支持 OpenAI-compatible Chat Completions。保存配置不会联网。角色卡无法更改此连接或读取密钥。
      </Text>
      <Text style={styles.label}>Base URL（HTTPS）</Text>
      <TextInput
        accessibilityLabel="Base URL"
        style={styles.input}
        value={profile.baseUrl}
        onChangeText={(baseUrl) => setProfile((previous) => ({ ...previous, baseUrl }))}
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="url"
        editable={!disabled}
      />
      <Text style={styles.label}>模型名称</Text>
      <TextInput
        accessibilityLabel="模型名称"
        style={styles.input}
        value={profile.model}
        placeholder="填写服务商提供的模型 ID"
        placeholderTextColor="#82909e"
        onChangeText={(model) => setProfile((previous) => ({ ...previous, model }))}
        autoCapitalize="none"
        autoCorrect={false}
        editable={!disabled}
      />
      <Text style={styles.label}>API Key（{hasKey ? '已保存；留空保留' : '尚未保存'}）</Text>
      <TextInput
        accessibilityLabel="API Key"
        style={styles.input}
        value={apiKey}
        onChangeText={setApiKey}
        secureTextEntry
        autoCapitalize="none"
        autoCorrect={false}
        autoComplete="off"
        importantForAutofill="no"
        editable={!disabled}
      />
      <Text style={styles.hint}>更换 Base URL 的主机或路径会清除旧密钥，需要明确重新填写。</Text>
      <Text style={styles.label}>上下文窗口 token（估算预算）</Text>
      <TextInput
        accessibilityLabel="上下文窗口"
        style={styles.input}
        value={contextWindow}
        onChangeText={setContextWindow}
        keyboardType="number-pad"
        editable={!disabled}
      />
      <Text style={styles.label}>最大输出 token</Text>
      <TextInput
        accessibilityLabel="最大输出 token"
        style={styles.input}
        value={maxOutputTokens}
        onChangeText={setMaxOutputTokens}
        keyboardType="number-pad"
        editable={!disabled}
      />
      <Text style={styles.label}>Temperature（0–2）</Text>
      <TextInput
        accessibilityLabel="Temperature"
        style={styles.input}
        value={temperature}
        onChangeText={setTemperature}
        keyboardType="decimal-pad"
        editable={!disabled}
      />
      <Pressable
        accessibilityRole="button"
        disabled={disabled}
        onPress={() => void save()}
        style={[styles.button, disabled && styles.disabled]}
      >
        <Text style={styles.buttonText}>{saving ? '正在保存…' : '保存模型配置'}</Text>
      </Pressable>
      {hasKey && (
        <Pressable
          accessibilityRole="button"
          disabled={disabled}
          onPress={() => void save(true)}
          style={[styles.clearButton, disabled && styles.disabled]}
        >
          <Text style={styles.text}>清除已保存的 API Key</Text>
        </Pressable>
      )}
      {message ? (
        <Text accessibilityLiveRegion="polite" style={styles.text}>
          {message}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: 10, padding: 16, backgroundColor: '#17212d', borderRadius: 12 },
  title: { color: '#f1f5f9', fontWeight: '700', fontSize: 21 },
  label: { color: '#e2e8f0', fontSize: 15, marginTop: 5 },
  hint: { color: '#aab8c8', lineHeight: 21, fontSize: 13 },
  text: { color: '#e2e8f0', lineHeight: 22 },
  input: {
    color: '#f8fafc',
    backgroundColor: '#101821',
    borderColor: '#526579',
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
    minHeight: 48,
  },
  button: { padding: 13, borderRadius: 8, backgroundColor: '#88dbb9', alignItems: 'center' },
  buttonText: { color: '#0b2419', fontWeight: '700', fontSize: 16 },
  clearButton: { padding: 12, alignItems: 'center' },
  disabled: { opacity: 0.5 },
});
