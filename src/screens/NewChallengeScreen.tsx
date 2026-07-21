import { useRef, useState } from 'react';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { Body, ErrorText, Eyebrow, Header, Screen, Title } from '@/components/ui';
import { createChallenge } from '@/lib/api';
import { colorChoices, colors } from '@/lib/theme';
import type { DurationPreset } from '@/types/domain';

const durations: Array<{ value: DurationPreset; label: string }> = [
  { value: '30min', label: '30 min' },
  { value: '2h', label: '2 horas' },
  { value: '6h', label: '6 horas' },
  { value: '24h', label: '24 horas' },
  { value: '48h', label: '48 horas' },
  { value: '1week', label: '1 semana' },
];

const photoCounts = [2, 4, 6, 8, 10, 12];
const sharedRandomChoice = { name: 'Color compartido aleatorio', hex: 'shared-random' };
const individualRandomChoice = { name: 'Color aleatorio individual', hex: 'individual-random' };

export function NewChallengeScreen({ clubId, onBack, onCreated }: { clubId: string; onBack: () => void; onCreated: (id: string) => void }) {
  const [color, setColor] = useState(colorChoices[0]!.hex);
  const [duration, setDuration] = useState<DurationPreset>('2h');
  const [photoCount, setPhotoCount] = useState(6);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const holdProgress = useRef(new Animated.Value(0)).current;
  const holdCompleted = useRef(false);
  const hapticInterval = useRef<ReturnType<typeof setInterval> | null>(null);
  const randomLaunchColor = useRef(colorChoices[Math.floor(Math.random() * colorChoices.length)]!.hex).current;
  const launchProgressColor = color.includes('random') ? randomLaunchColor : color;

  function stopHaptics() {
    if (!hapticInterval.current) return;
    clearInterval(hapticInterval.current);
    hapticInterval.current = null;
  }

  async function launch() {
    setLoading(true);
    setError(null);
    const mode = color === individualRandomChoice.hex ? 'individual_random' : 'shared_color';
    const sharedColor = color === sharedRandomChoice.hex ? colorChoices[Math.floor(Math.random() * colorChoices.length)]!.hex : color;
    const colorSelectionMode = color === sharedRandomChoice.hex ? 'shared_random' : color === individualRandomChoice.hex ? 'individual_random' : 'manual';
    try { onCreated(await createChallenge(clubId, mode, sharedColor, duration, photoCount, colorSelectionMode)); }
    catch (caught) { setError((caught as Error).message); setLoading(false); }
  }

  function beginHold() {
    if (loading) return;
    holdCompleted.current = false;
    holdProgress.setValue(0);
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    stopHaptics();
    hapticInterval.current = setInterval(() => {
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }, 210);
    Animated.timing(holdProgress, {
      toValue: 1,
      duration: 1200,
      useNativeDriver: false,
    }).start(({ finished }) => {
      stopHaptics();
      if (!finished || loading) return;
      holdCompleted.current = true;
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      void launch();
    });
  }

  function endHold() {
    stopHaptics();
    if (holdCompleted.current || loading) return;
    holdProgress.stopAnimation(() => {
      Animated.timing(holdProgress, {
        toValue: 0,
        duration: 180,
        useNativeDriver: false,
      }).start();
    });
  }

  return (
    <Screen stickyHeader bottomInset={28}>
      <Header title="Nuevo reto" onBack={onBack} />
      <View style={styles.heading}><Eyebrow>Configuración</Eyebrow><Title>Elige las reglas</Title><Body muted>Elige un color, usa shuffle para color común aleatorio o ? para color único por persona.</Body></View>
      <Text style={styles.label}>Color del reto</Text><View style={styles.palette}>
        {[...colorChoices, sharedRandomChoice, individualRandomChoice].map((choice) => (
          <Pressable key={choice.hex} accessibilityLabel={choice.name} onPress={() => setColor(choice.hex)} style={[styles.colorOption, choice.hex.includes('random') ? styles.randomColorOption : { backgroundColor: choice.hex }, color === choice.hex && styles.colorSelected]}>
            {choice.hex === sharedRandomChoice.hex ? <Ionicons color={colors.white} name="shuffle" size={25} /> : choice.hex === individualRandomChoice.hex ? <Text style={styles.randomMark}>?</Text> : color === choice.hex && <Text style={[styles.check, choice.hex === '#E9E6DF' && styles.checkDark]}>✓</Text>}
          </Pressable>
        ))}
      </View>
      {color === sharedRandomChoice.hex && <View style={styles.explainer}><Text style={styles.explainerTitle}>Mismo color aleatorio</Text><Text style={styles.explainerText}>La app elegirá un color al azar y será el mismo para todo el club.</Text></View>}
      {color === individualRandomChoice.hex && <View style={styles.explainer}><Text style={styles.explainerTitle}>Color único por persona</Text><Text style={styles.explainerText}>Cada participante recibirá un color aleatorio distinto al de los demás.</Text></View>}
      <Text style={styles.label}>Número de fotos</Text>
      <View style={styles.countList}>
        {photoCounts.map((count) => <Pressable key={count} onPress={() => setPhotoCount(count)} style={[styles.countOption, photoCount === count && styles.countSelected]}><Text style={[styles.countText, photoCount === count && styles.durationTextSelected]}>{count}</Text></Pressable>)}
      </View>
      <Text style={styles.label}>Tiempo para completar el reto</Text>
      <View style={styles.durationList}>
        {durations.map((item) => (
          <Pressable key={item.value} onPress={() => setDuration(item.value)} style={[styles.duration, duration === item.value && styles.durationSelected]}>
            <Text style={[styles.durationText, duration === item.value && styles.durationTextSelected]}>{item.label}</Text>
          </Pressable>
        ))}
      </View>
      <View style={styles.launchPanel}>
        <View style={styles.launchSummary}>
          <View style={styles.launchChip}><View style={[styles.launchDot, { backgroundColor: color.includes('random') ? colors.ink : color }]} /><Text style={styles.launchChipText}>{color === individualRandomChoice.hex ? 'Único' : color === sharedRandomChoice.hex ? 'Aleatorio' : 'Compartido'}</Text></View>
          <View style={styles.launchChip}><Ionicons color={colors.ink} name="images-outline" size={15} /><Text style={styles.launchChipText}>{photoCount} fotos</Text></View>
          <View style={styles.launchChip}><Ionicons color={colors.ink} name="timer-outline" size={15} /><Text style={styles.launchChipText}>{durations.find((item) => item.value === duration)?.label}</Text></View>
        </View>
        <Pressable disabled={loading} onPressIn={beginHold} onPressOut={endHold} style={({ pressed }) => [styles.launchButton, pressed && styles.launchPressed, loading && styles.launchLoading]}>
          <Animated.View pointerEvents="none" style={[styles.launchProgress, { backgroundColor: launchProgressColor, width: holdProgress.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }) }]} />
          <View><Text style={styles.launchButtonKicker}>{loading ? 'Confirmado' : 'Mantén pulsado'}</Text><Text style={styles.launchButtonText}>{loading ? 'Lanzando reto...' : 'Lanzar reto'}</Text></View>
          <View style={styles.launchArrow}>{loading ? <Text style={styles.launchArrowText}>...</Text> : <Ionicons color={colors.ink} name="arrow-forward" size={20} />}</View>
        </Pressable>
      </View>
      <ErrorText message={error} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  heading: { marginVertical: 24, gap: 8 },
  label: { color: colors.muted, fontSize: 13, fontWeight: '600', marginTop: 28, marginBottom: 14 },
  palette: { flexDirection: 'row', flexWrap: 'wrap', gap: 14 },
  colorOption: { width: 58, height: 58, borderRadius: 21, justifyContent: 'center', alignItems: 'center', borderWidth: 4, borderColor: colors.paper },
  randomColorOption: { backgroundColor: colors.ink },
  randomMark: { color: colors.white, fontSize: 26, fontWeight: '900' },
  explainer: { marginTop: 12, padding: 16, borderRadius: 20, backgroundColor: colors.blue, gap: 4 },
  explainerTitle: { color: colors.ink, fontSize: 15, fontWeight: '900' },
  explainerText: { color: colors.ink, opacity: 0.72, fontSize: 12, lineHeight: 17 },
  colorSelected: { borderWidth: 4, borderColor: colors.ink, transform: [{ scale: 1.08 }] },
  check: { color: colors.white, fontSize: 19, fontWeight: '700' },
  checkDark: { color: colors.ink },
  countList: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  countOption: { width: 54, height: 54, borderRadius: 18, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, alignItems: 'center', justifyContent: 'center' },
  countSelected: { backgroundColor: colors.ink, borderColor: colors.ink },
  countText: { color: colors.ink, fontSize: 17, fontWeight: '900' },
  durationList: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  duration: { minWidth: '31%', flexGrow: 1, borderWidth: 1, borderColor: colors.line, borderRadius: 20, backgroundColor: colors.surface, paddingVertical: 17, alignItems: 'center' },
  durationSelected: { borderColor: colors.ink, backgroundColor: colors.ink },
  durationText: { color: colors.ink, fontWeight: '600', fontSize: 13 },
  durationTextSelected: { color: colors.white },
  launchPanel: { marginTop: 30, marginBottom: 12, gap: 12 },
  launchSummary: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  launchChip: { minHeight: 38, paddingHorizontal: 12, borderRadius: 19, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, flexDirection: 'row', alignItems: 'center', gap: 7 },
  launchDot: { width: 15, height: 15, borderRadius: 6, borderWidth: 2, borderColor: '#FFFFFFAA' },
  launchChipText: { color: colors.ink, fontSize: 12, fontWeight: '800' },
  launchButton: { minHeight: 82, borderRadius: 28, backgroundColor: colors.ink, paddingHorizontal: 20, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', overflow: 'hidden' },
  launchProgress: { position: 'absolute', left: 0, top: 0, bottom: 0 },
  launchPressed: { transform: [{ translateY: 1 }] },
  launchLoading: { opacity: 0.72 },
  launchButtonKicker: { color: colors.white, opacity: 0.58, fontSize: 12, fontWeight: '800', marginBottom: 3 },
  launchButtonText: { color: colors.white, fontSize: 24, fontWeight: '900', letterSpacing: -0.5 },
  launchArrow: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.white, alignItems: 'center', justifyContent: 'center' },
  launchArrowText: { color: colors.ink, fontSize: 15, fontWeight: '900' },
});
