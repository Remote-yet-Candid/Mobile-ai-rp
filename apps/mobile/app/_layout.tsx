import { Stack } from 'expo-router';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { RuntimeProvider } from '../src/runtime';
export default function Layout() {
  return (
    <SafeAreaProvider>
      <StatusBar style="auto" />
      <RuntimeProvider>
        <Stack screenOptions={{ headerShown: false }} />
      </RuntimeProvider>
    </SafeAreaProvider>
  );
}
