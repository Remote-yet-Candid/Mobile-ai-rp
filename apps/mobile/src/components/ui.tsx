import { Pressable, Text, View, useColorScheme, StyleSheet, type ViewStyle } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { ReactNode } from 'react';

export function useTheme() {
  const dark = useColorScheme() === 'dark';
  return {
    background: dark ? '#141a20' : '#f7f5ef',
    surface: dark ? '#202b34' : '#ffffff',
    text: dark ? '#f4f0e8' : '#202b34',
    muted: dark ? '#acbac3' : '#566775',
    accent: dark ? '#99d4ca' : '#245f60',
    line: dark ? '#41515c' : '#d8dedc',
  };
}
export function Screen({ children, style }: { children: ReactNode; style?: ViewStyle }) {
  const theme = useTheme();
  return (
    <SafeAreaView style={[{ flex: 1, backgroundColor: theme.background }, style]}>
      {children}
    </SafeAreaView>
  );
}
export function Action({
  label,
  onPress,
  disabled = false,
  secondary = false,
}: {
  label: string;
  onPress(): void;
  disabled?: boolean;
  secondary?: boolean;
}) {
  const theme = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      disabled={disabled}
      onPress={onPress}
      style={{
        paddingHorizontal: 14,
        paddingVertical: 12,
        borderRadius: 12,
        backgroundColor: secondary ? theme.surface : '#315f73',
        opacity: disabled ? 0.45 : 1,
        borderWidth: secondary ? 1 : 0,
        borderColor: theme.line,
      }}
    >
      <Text style={{ color: secondary ? theme.text : '#ffffff', fontSize: 15, fontWeight: '600' }}>
        {label}
      </Text>
    </Pressable>
  );
}
export function Heading({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children?: ReactNode;
}) {
  const theme = useTheme();
  return (
    <View
      style={{
        padding: 18,
        gap: 9,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: theme.line,
      }}
    >
      <Text
        accessibilityRole="header"
        numberOfLines={2}
        style={{ color: theme.text, fontSize: 25, fontWeight: '700' }}
      >
        {title}
      </Text>
      {subtitle && <Text style={{ color: theme.muted }}>{subtitle}</Text>}
      {children}
    </View>
  );
}
