import type { PropsWithChildren, ReactNode } from 'react';
import {
  ActivityIndicator,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  type TextInputProps,
  View,
  type ViewStyle,
} from 'react-native';
import { colors } from '@/lib/theme';

export function Screen({ children, scroll = true }: PropsWithChildren<{ scroll?: boolean }>) {
  return (
    <SafeAreaView style={styles.safe}>
      {scroll ? <ScrollView contentContainerStyle={styles.screen}>{children}</ScrollView> : <View style={styles.screen}>{children}</View>}
    </SafeAreaView>
  );
}

export function Eyebrow({ children }: PropsWithChildren) {
  return <Text style={styles.eyebrow}>{children}</Text>;
}

export function Title({ children, size = 'large' }: PropsWithChildren<{ size?: 'large' | 'medium' }>) {
  return <Text style={[styles.title, size === 'medium' && styles.titleMedium]}>{children}</Text>;
}

export function Body({ children, muted = false }: PropsWithChildren<{ muted?: boolean }>) {
  return <Text style={[styles.body, muted && styles.muted]}>{children}</Text>;
}

export function Card({ children, style }: PropsWithChildren<{ style?: ViewStyle }>) {
  return <View style={[styles.card, style]}>{children}</View>;
}

export function Button({
  label,
  onPress,
  variant = 'primary',
  disabled,
  loading,
}: {
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'quiet' | 'danger';
  disabled?: boolean;
  loading?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled || loading}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        styles[`${variant}Button`],
        (disabled || loading) && styles.disabled,
        pressed && styles.pressed,
      ]}
    >
      {loading ? <ActivityIndicator color={variant === 'primary' ? colors.white : colors.ink} /> : (
        <Text style={[styles.buttonText, variant === 'primary' && styles.primaryButtonText, variant === 'danger' && styles.dangerButtonText]}>
          {label}
        </Text>
      )}
    </Pressable>
  );
}

export function Field({ label, ...props }: TextInputProps & { label: string }) {
  return (
    <View style={styles.fieldWrap}>
      <Text style={styles.label}>{label}</Text>
      <TextInput placeholderTextColor={colors.muted} style={styles.input} {...props} />
    </View>
  );
}

export function Header({ title, onBack, action }: { title: string; onBack?: () => void; action?: ReactNode }) {
  return (
    <View style={styles.header}>
      <View style={styles.headerSide}>{onBack && <Pressable onPress={onBack}><Text style={styles.headerAction}>← Volver</Text></Pressable>}</View>
      <Text numberOfLines={1} style={styles.headerTitle}>{title}</Text>
      <View style={[styles.headerSide, styles.headerRight]}>{action}</View>
    </View>
  );
}

export function ErrorText({ message }: { message: string | null }) {
  return message ? <Text style={styles.error}>{message}</Text> : null;
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.paper },
  screen: { flexGrow: 1, paddingHorizontal: 20, paddingBottom: 40 },
  eyebrow: { color: colors.coral, fontSize: 12, fontWeight: '800', letterSpacing: 1.8, textTransform: 'uppercase', marginBottom: 8 },
  title: { color: colors.ink, fontSize: 42, lineHeight: 44, fontWeight: '900', letterSpacing: -1.8 },
  titleMedium: { fontSize: 28, lineHeight: 32, letterSpacing: -0.8 },
  body: { color: colors.ink, fontSize: 16, lineHeight: 23 },
  muted: { color: colors.muted },
  card: { backgroundColor: colors.surface, borderColor: colors.line, borderWidth: 1, borderRadius: 4, padding: 18 },
  button: { minHeight: 52, borderRadius: 3, paddingHorizontal: 18, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.ink },
  primaryButton: { backgroundColor: colors.ink },
  secondaryButton: { backgroundColor: colors.surface },
  quietButton: { borderColor: 'transparent', minHeight: 42 },
  dangerButton: { backgroundColor: colors.surface, borderColor: colors.danger },
  buttonText: { color: colors.ink, fontSize: 15, fontWeight: '800' },
  primaryButtonText: { color: colors.white },
  dangerButtonText: { color: colors.danger },
  disabled: { opacity: 0.45 },
  pressed: { opacity: 0.75, transform: [{ translateY: 1 }] },
  fieldWrap: { gap: 7 },
  label: { color: colors.ink, fontSize: 12, fontWeight: '800', letterSpacing: 1, textTransform: 'uppercase' },
  input: { minHeight: 52, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, borderRadius: 3, paddingHorizontal: 14, color: colors.ink, fontSize: 16 },
  header: { minHeight: 64, marginHorizontal: -2, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  headerSide: { width: 82 },
  headerRight: { alignItems: 'flex-end' },
  headerAction: { color: colors.cobalt, fontWeight: '800' },
  headerTitle: { flex: 1, textAlign: 'center', color: colors.ink, fontWeight: '900', fontSize: 15 },
  error: { color: colors.danger, fontSize: 14, lineHeight: 20 },
});
