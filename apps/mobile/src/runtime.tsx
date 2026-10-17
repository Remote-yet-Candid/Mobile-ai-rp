import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { View, Text, Pressable } from 'react-native';
import * as Crypto from 'expo-crypto';
import { openAppStore } from './infra/storage/app-native';
import { createSecureProfileService } from './infra/secure-profile';

async function openRuntime() {
  const store = await openAppStore();
  const profiles = createSecureProfileService(store);
  return { store, profiles };
}
export type Runtime = Awaited<ReturnType<typeof openRuntime>>;
const Context = createContext<Runtime | null>(null);
let pending: Promise<Runtime> | undefined;
export const newId = () => Crypto.randomUUID();

export function RuntimeProvider({ children }: { children: ReactNode }) {
  const [runtime, setRuntime] = useState<Runtime | null>(null);
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let live = true;
    setError(false);
    pending ??= openRuntime().catch((error) => {
      pending = undefined;
      throw error;
    });
    void pending
      .then((value) => {
        if (live) setRuntime(value);
      })
      .catch(() => {
        if (live) setError(true);
      });
    return () => {
      live = false;
    };
  }, [attempt]);
  if (!runtime)
    return (
      <View
        style={{
          flex: 1,
          justifyContent: 'center',
          padding: 28,
          backgroundColor: '#f7f5ef',
          gap: 20,
        }}
      >
        <Text style={{ color: '#20232b', fontSize: 18 }}>
          {error ? '无法打开本地数据库。原数据已保留，不会自动清库。' : '正在打开本地角色与聊天…'}
        </Text>
        {error && (
          <Pressable accessibilityRole="button" onPress={() => setAttempt((n) => n + 1)}>
            <Text style={{ color: '#315f73' }}>重试打开</Text>
          </Pressable>
        )}
      </View>
    );
  return <Context.Provider value={runtime}>{children}</Context.Provider>;
}
export function useRuntime() {
  const value = useContext(Context);
  if (!value) throw new Error('Runtime not ready');
  return value;
}
