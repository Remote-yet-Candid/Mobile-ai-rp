import { useCallback, useState } from 'react';
import { ScrollView, Text, View, Pressable } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { useRuntime, newId } from '../src/runtime';
import { Action, Heading, Screen, useTheme } from '../src/components/ui';
import { pickProbeCard } from '../src/infra/card-import';
import { describeImportError, describeInspection } from '../src/infra/import-feedback';
import type { CharacterSummary, Conversation } from '../src/infra/storage/app-store';

export default function Home() {
  const { store } = useRuntime();
  const theme = useTheme();
  const router = useRouter();
  const [characters, setCharacters] = useState<CharacterSummary[]>([]);
  const [chats, setChats] = useState<Conversation[]>([]);
  const [status, setStatus] = useState('导入角色，设置模型，然后开始你的故事。');
  const [busy, setBusy] = useState(false);
  const refresh = useCallback(async () => {
    const [cards, conversations] = await Promise.all([
      store.listCharacters(),
      store.listConversations(),
    ]);
    setCharacters(cards);
    setChats(conversations);
  }, [store]);
  useFocusEffect(
    useCallback(() => {
      let live = true;
      void Promise.all([store.listCharacters(), store.listConversations()])
        .then(([cards, conversations]) => {
          if (live) {
            setCharacters(cards);
            setChats(conversations);
          }
        })
        .catch(() => {
          if (live) setStatus('本地列表读取失败，原有记录已保留。');
        });
      return () => {
        live = false;
      };
    }, [store]),
  );
  async function importCharacter() {
    if (busy) return;
    setBusy(true);
    try {
      const result = await pickProbeCard();
      if (!result) {
        setStatus('已取消选择。');
        return;
      }
      if (result.kind !== 'character_card') {
        setStatus(describeInspection(result));
        return;
      }
      const saved = await store.importCharacter(result.card.document, {
        characterId: newId(),
        revisionId: newId(),
        now: Date.now(),
      });
      await refresh();
      setStatus(`已保存角色 ${saved.name.slice(0, 80)}。未知字段保留；未执行扩展或脚本。`);
      router.push({ pathname: '/character/[id]', params: { id: saved.id } });
    } catch (error) {
      setStatus(describeImportError(error));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Screen>
      <Heading title="Mobile AI RP" subtitle="v0.1 可交互原型 · 你的角色，你的故事">
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
          <Action
            label={busy ? '正在导入…' : '导入角色卡'}
            onPress={() => void importCharacter()}
            disabled={busy}
          />
          <Action label="模型设置" secondary onPress={() => router.push('/settings')} />
        </View>
      </Heading>
      <ScrollView
        contentContainerStyle={{ padding: 18, gap: 14 }}
        keyboardShouldPersistTaps="handled"
      >
        <Text accessibilityLiveRegion="polite" style={{ color: theme.muted, lineHeight: 22 }}>
          {status}
        </Text>
        <Text
          accessibilityRole="header"
          style={{ fontSize: 21, fontWeight: '700', color: theme.text }}
        >
          角色
        </Text>
        {!characters.length && (
          <View style={{ backgroundColor: theme.surface, padding: 20, borderRadius: 14, gap: 10 }}>
            <Text style={{ color: theme.text, fontSize: 17 }}>从一张角色卡开始</Text>
            <Text style={{ color: theme.muted, lineHeight: 23 }}>
              支持 Character Card V2 / V3 的 JSON 和
              PNG。角色设定会参与实际请求；生成预设不会被误导入成角色。
            </Text>
          </View>
        )}
        {characters.map((card) => (
          <Pressable
            key={card.id}
            accessibilityRole="button"
            accessibilityLabel={`查看角色 ${card.name.slice(0, 80)}`}
            onPress={() => router.push({ pathname: '/character/[id]', params: { id: card.id } })}
            style={{ backgroundColor: theme.surface, padding: 18, borderRadius: 14, gap: 6 }}
          >
            <Text numberOfLines={2} style={{ color: theme.text, fontWeight: '700', fontSize: 19 }}>
              {card.name.slice(0, 160)}
            </Text>
            <Text style={{ color: theme.accent }}>查看设定 · 开始聊天 →</Text>
          </Pressable>
        ))}
        <Text
          accessibilityRole="header"
          style={{ fontSize: 21, fontWeight: '700', color: theme.text }}
        >
          聊天记录
        </Text>
        {!chats.length && (
          <Text style={{ color: theme.muted }}>选择一个角色创建聊天，记录会保存在这台手机上。</Text>
        )}
        {chats.map((chat) => (
          <Pressable
            key={chat.id}
            accessibilityRole="button"
            onPress={() => router.push({ pathname: '/chat/[id]', params: { id: chat.id } })}
            style={{ backgroundColor: theme.surface, padding: 16, borderRadius: 14, gap: 5 }}
          >
            <Text numberOfLines={2} style={{ color: theme.text, fontSize: 17 }}>
              {chat.title.slice(0, 160)}
            </Text>
            <Text style={{ color: theme.muted }}>
              {new Date(chat.createdAt).toLocaleString()} · 继续聊天 →
            </Text>
          </Pressable>
        ))}
        <Text style={{ color: theme.muted, fontSize: 12 }}>
          测试原型；上游安全风险继续跟踪，尚非正式发布版。角色与聊天不自动上传；发送消息时会传至你设置的模型服务。
        </Text>
        <Action label="打开技术验证" secondary onPress={() => router.push('/lab')} />
      </ScrollView>
    </Screen>
  );
}
