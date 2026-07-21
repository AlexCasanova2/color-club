import { useEffect, useRef, useState } from 'react';
import { Animated, Modal, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '@/lib/theme';

const toastDuration = 1500;

export function ToastBubble({ message, onHidden, trigger, compact = false, style }: {
  message: string | null;
  onHidden?: () => void;
  trigger?: unknown;
  compact?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const [width, setWidth] = useState(0);
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(8)).current;
  const progress = useRef(new Animated.Value(0)).current;
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!message) return;
    if (hideTimer.current) clearTimeout(hideTimer.current);
    progress.stopAnimation();
    opacity.setValue(0);
    translateY.setValue(8);
    progress.setValue(0);
    Animated.parallel([
      Animated.timing(opacity, { toValue: 1, duration: 180, useNativeDriver: true }),
      Animated.spring(translateY, { toValue: 0, damping: 18, mass: 0.7, stiffness: 180, useNativeDriver: true }),
    ]).start();
    Animated.timing(progress, { toValue: 1, duration: toastDuration, useNativeDriver: false }).start(({ finished }) => {
      if (!finished) return;
      hideTimer.current = setTimeout(() => {
        Animated.parallel([
          Animated.timing(opacity, { toValue: 0, duration: 180, useNativeDriver: true }),
          Animated.timing(translateY, { toValue: 8, duration: 180, useNativeDriver: true }),
        ]).start(({ finished: hidden }) => {
          if (hidden) onHidden?.();
        });
      }, 180);
    });

    return () => {
      if (hideTimer.current) clearTimeout(hideTimer.current);
      progress.stopAnimation();
    };
  }, [message, trigger, onHidden, opacity, progress, translateY]);

  if (!message) return null;

  return (
    <Animated.View onLayout={(event) => setWidth(event.nativeEvent.layout.width)} pointerEvents="none" style={[styles.toast, compact && styles.compactToast, { opacity, transform: [{ translateY }] }, style]}>
      <Ionicons color={colors.ink} name="checkmark-circle" size={compact ? 18 : 20} />
      <Text style={styles.toastText}>{message}</Text>
      <Animated.View style={[styles.toastProgress, { width: progress.interpolate({ inputRange: [0, 1], outputRange: [0, width] }) }]} />
    </Animated.View>
  );
}

export function ToastOverlay({ message, onHidden, trigger }: { message: string | null; onHidden?: () => void; trigger?: unknown }) {
  return (
    <Modal animationType="fade" transparent visible={message !== null}>
      <View pointerEvents="none" style={styles.toastLayer}>
        <ToastBubble message={message} onHidden={onHidden} trigger={trigger} />
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  toastLayer: { flex: 1, justifyContent: 'flex-end', paddingHorizontal: 18, paddingBottom: 112 },
  toast: { minHeight: 58, paddingHorizontal: 18, borderRadius: 22, backgroundColor: colors.white, borderWidth: 1, borderColor: colors.line, flexDirection: 'row', alignItems: 'center', gap: 10, overflow: 'hidden', shadowColor: colors.ink, shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.14, shadowRadius: 18, elevation: 9 },
  compactToast: { minHeight: 50, paddingHorizontal: 16, borderRadius: 20, justifyContent: 'center', gap: 8 },
  toastProgress: { position: 'absolute', left: 0, bottom: 0, height: 4, backgroundColor: colors.green, borderBottomLeftRadius: 20, borderBottomRightRadius: 20 },
  toastText: { color: colors.ink, fontSize: 14, fontWeight: '700' },
});
