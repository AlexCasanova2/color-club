import { useEffect, useRef, type PropsWithChildren, type ReactNode } from 'react';
import {
  ActivityIndicator,
  Animated,
  Platform,
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
import { Ionicons } from '@expo/vector-icons';
import { colors } from '@/lib/theme';

export function Screen({ children, scroll = true, bottomInset = 112, stickyHeader = false }: PropsWithChildren<{ scroll?: boolean; bottomInset?: number; stickyHeader?: boolean }>) {
  return (
    <View style={styles.safe}>
      <SafeAreaView style={styles.topSafe} />
      {scroll ? (
        <ScrollView
          automaticallyAdjustKeyboardInsets
          contentContainerStyle={[styles.screen, { paddingBottom: bottomInset }]}
          keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
          keyboardShouldPersistTaps="handled"
          showsHorizontalScrollIndicator={false}
          showsVerticalScrollIndicator={false}
          stickyHeaderIndices={stickyHeader ? [0] : undefined}
        >
          {children}
        </ScrollView>
      ) : <View style={[styles.screen, styles.fixedScreen, { paddingBottom: bottomInset }]}>{children}</View>}
    </View>
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
      <View style={styles.island}>
        <View style={styles.headerSide}>
          {onBack ? (
            <Pressable accessibilityLabel="Volver" accessibilityRole="button" onPress={onBack} style={({ pressed }) => [styles.backButton, pressed && styles.headerPressed]}>
              <Ionicons color={colors.white} name="chevron-back" size={21} />
            </Pressable>
          ) : (
            <View style={styles.islandMark}><View style={[styles.islandDot, { backgroundColor: colors.orange }]} /><View style={[styles.islandDot, { backgroundColor: colors.lavender }]} /></View>
          )}
        </View>
        <Text numberOfLines={1} style={styles.headerTitle}>{title}</Text>
        <View style={[styles.headerSide, styles.headerRight]}>{action ?? <View style={styles.liveDot} />}</View>
      </View>
    </View>
  );
}

export function ErrorText({ message }: { message: string | null }) {
  return message ? <Text style={styles.error}>{message}</Text> : null;
}

export function SkeletonBlock({ style }: { style?: ViewStyle }) {
  const opacity = useRef(new Animated.Value(0.45)).current;
  useEffect(() => {
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(opacity, { toValue: 0.85, duration: 760, useNativeDriver: true }),
      Animated.timing(opacity, { toValue: 0.45, duration: 760, useNativeDriver: true }),
    ]));
    loop.start();
    return () => loop.stop();
  }, [opacity]);
  return <Animated.View style={[styles.skeleton, style, { opacity }]} />;
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.paper },
  topSafe: { backgroundColor: colors.paper },
  screen: { flexGrow: 1, paddingHorizontal: 18 },
  fixedScreen: { flex: 1 },
  eyebrow: { color: colors.muted, fontSize: 13, fontWeight: '500', marginBottom: 7 },
  title: { color: colors.ink, fontSize: 40, lineHeight: 43, fontWeight: '800', letterSpacing: -1.5 },
  titleMedium: { fontSize: 27, lineHeight: 31, letterSpacing: -0.8 },
  body: { color: colors.ink, fontSize: 16, lineHeight: 24 },
  muted: { color: colors.muted },
  card: { backgroundColor: colors.surface, borderColor: colors.line, borderWidth: 1, borderRadius: 24, padding: 20 },
  button: { minHeight: 54, borderRadius: 18, paddingHorizontal: 18, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.ink },
  primaryButton: { backgroundColor: colors.ink },
  secondaryButton: { backgroundColor: colors.surface },
  quietButton: { borderColor: 'transparent', minHeight: 44 },
  dangerButton: { backgroundColor: colors.surface, borderColor: colors.danger },
  buttonText: { color: colors.ink, fontSize: 15, fontWeight: '600' },
  primaryButtonText: { color: colors.white },
  dangerButtonText: { color: colors.danger },
  disabled: { opacity: 0.45 },
  pressed: { opacity: 0.75, transform: [{ translateY: 1 }] },
  fieldWrap: { gap: 7 },
  label: { color: colors.muted, fontSize: 13, fontWeight: '600' },
  input: { minHeight: 54, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, borderRadius: 18, paddingHorizontal: 16, color: colors.ink, fontSize: 16 },
  header: { minHeight: 74, justifyContent: 'center', paddingTop: 6 },
  island: { minHeight: 54, paddingHorizontal: 8, borderRadius: 28, backgroundColor: colors.ink, flexDirection: 'row', alignItems: 'center', shadowColor: colors.ink, shadowOffset: { width: 0, height: 7 }, shadowOpacity: 0.16, shadowRadius: 14, elevation: 7 },
  headerSide: { width: 46, justifyContent: 'center' },
  headerRight: { alignItems: 'flex-end' },
  backButton: { width: 38, height: 38, borderRadius: 19, backgroundColor: '#292A31', alignItems: 'center', justifyContent: 'center' },
  headerPressed: { opacity: 0.55 },
  islandMark: { width: 38, height: 38, borderRadius: 19, backgroundColor: '#292A31', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 3 },
  islandDot: { width: 7, height: 7, borderRadius: 4 },
  liveDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.green, marginRight: 12 },
  headerTitle: { flex: 1, textAlign: 'center', color: colors.white, fontWeight: '700', fontSize: 14, letterSpacing: 0.1 },
  error: { color: colors.danger, fontSize: 14, lineHeight: 20 },
  skeleton: { backgroundColor: '#E3E1DA', borderRadius: 22 },
});
