import { useEffect, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import type { CharacterCard } from '@mobile-ai-rp/rp-card-codecs';
import { useRuntime, newId } from '../../src/runtime';
import { Action, Heading, Screen, useTheme } from '../../src/components/ui';

export default function CharacterInfo() {
  const { id: value } = useLocalSearchParams<{ id: string }>();
  const id = Array.isArray(value) ? (value[0] ?? '') : value;
  const { store } = useRuntime();
  const theme = useTheme();
  const router = useRouter();
  const [card, setCard] = useState<CharacterCard | null>(null);
  const [status, setStatus] = useState('正在读取角色…');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let live = true;
    void store
      .getCharacter(id)
      .then((character) => store.getCard(character.revisionId))
      .then((document) => {
        if (live) {
          setCard(document);
          setStatus('角色保存在本机；新聊天使用此刻的角色修订快照。');
        }
      })
      .catch(() => {
        if (live) setStatus('角色读取失败，请返回角色列表重试。');
      });
    return () => {
      live = false;
    };
  }, [id, store]);
  async function createChat() {
    if (!card || busy) return;
    setBusy(true);
    try {
      const text = String(card.data.first_mes ?? '')
        .replace(/\{\{char\}\}/g, () => card.data.name)
        .replace(/\{\{user\}\}/g, '旅人');
      const conversation = await store.createConversation({
        id: newId(),
        characterId: id,
        title: `${card.data.name.slice(0, 80)}的故事`,
        now: Date.now(),
        ...(text ? { greeting: { id: newId(), text } } : {}),
      });
      router.replace({ pathname: '/chat/[id]', params: { id: conversation.id } });
    } catch {
      setStatus('创建聊天失败，原有数据未被修改。');
    } finally {
      setBusy(false);
    }
  }
  return (
    <Screen>
      <Heading title={card?.data.name.slice(0, 100) ?? '角色信息'} subtitle={card?.spec ?? ''}>
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <Action label="返回" secondary onPress={() => router.back()} />
          <Action label="创建聊天" onPress={() => void createChat()} disabled={!card || busy} />
        </View>
      </Heading>
      <ScrollView contentContainerStyle={{ padding: 18, gap: 18 }}>
        <Text style={{ color: theme.muted }}>{status}</Text>
        {card &&
          (
            [
              ['描述', 'description'],
              ['性格', 'personality'],
              ['场景', 'scenario'],
              ['开场白', 'first_mes'],
              ['作者说明（不进入默认 Prompt）', 'creator_notes'],
            ] as const
          ).map(([label, field]) => (
            <View key={field} style={{ gap: 7 }}>
              <Text style={{ color: theme.accent, fontWeight: '700', fontSize: 17 }}>{label}</Text>
              <Text selectable style={{ color: theme.text, lineHeight: 24 }}>
                {String(card.data[field] ?? '').slice(0, 12000) || '未填写'}
              </Text>
            </View>
          ))}
        <Text style={{ color: theme.muted }}>
          信息页单字段最多展示 12000 字符，原始角色数据完整保留。仅替换 char / user
          基础宏；世界书、复杂宏和扩展行为本阶段未实现。
        </Text>
      </ScrollView>
    </Screen>
  );
}
