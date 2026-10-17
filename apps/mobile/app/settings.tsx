import { useRouter } from 'expo-router';
import { useRuntime } from '../src/runtime';
import { Screen, Heading, Action } from '../src/components/ui';
import { ModelSettings } from '../src/components/ModelSettings';
import { KeyboardAvoidingView, Platform, ScrollView } from 'react-native';

export default function Settings() {
  const { profiles } = useRuntime();
  const router = useRouter();
  return (
    <Screen>
      <Heading title="模型连接" subtitle="OpenAI-compatible · HTTPS · 本机安全保存">
        <Action label="返回" secondary onPress={() => router.back()} />
      </Heading>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          contentContainerStyle={{ paddingBottom: 36 }}
        >
          <ModelSettings service={profiles} />
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}
