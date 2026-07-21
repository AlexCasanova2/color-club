import { useEffect, useRef, useState } from 'react';
import { Animated, Pressable, SafeAreaView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Button } from '@/components/ui';
import { colors } from '@/lib/theme';

const slides = [
  { title: 'Caza colores con tu gente', body: 'Encuentra el color del reto en el mundo real antes que nadie.', accent: colors.orange },
  { title: 'Monta tu collage', body: 'Combina tus hallazgos y deja que cada color encuentre su sitio.', accent: colors.blue },
  { title: 'Vota con cariño', body: 'El club elige la composición que mejor capturó el color.', accent: colors.green },
  { title: 'Presume de ojo cromático', body: 'Suma puntos, sube en el ranking y gana gloria colorista.', accent: colors.lavender },
];

function Geometry({ index }: { index: number }) {
  return (
    <View pointerEvents="none" style={styles.backgroundShapes}>
      <Text style={[styles.backgroundNumber, index % 2 === 1 && styles.backgroundNumberLeft]}>0{index + 1}</Text>
      <View style={[styles.backgroundCircle, index % 2 === 1 && styles.backgroundCircleLeft]} />
      <View style={[styles.backgroundFrame, index > 1 && styles.backgroundFrameHigh]} />
    </View>
  );
}

export function OnboardingScreen({ onDone }: { onDone: () => void }) {
  const { height } = useWindowDimensions();
  const [index, setIndex] = useState(0);
  const progress = useRef(new Animated.Value(0)).current;
  const slide = slides[index]!;
  const compact = height < 700;
  const veryCompact = height < 600;

  useEffect(() => {
    Animated.timing(progress, { toValue: index, duration: 260, useNativeDriver: false }).start();
  }, [index, progress]);

  function next() {
    if (index === slides.length - 1) onDone();
    else setIndex((current) => current + 1);
  }

  function previous() {
    setIndex((current) => Math.max(0, current - 1));
  }

  const progressWidth = progress.interpolate({ inputRange: [0, slides.length - 1], outputRange: ['25%', '100%'] });

  return (
    <SafeAreaView style={[styles.screen, { backgroundColor: slide.accent }]}>
      <View style={[styles.wrap, compact && styles.wrapCompact]}>
        <Geometry index={index} />

        <View style={styles.topBar}>
          <View style={styles.brand}>
            <View style={[styles.brandDot, { backgroundColor: slide.accent }]} />
            <Text style={styles.brandText}>Color Club</Text>
          </View>
          <Pressable accessibilityRole="button" onPress={onDone} style={({ pressed }) => [styles.skip, pressed && styles.pressed]}>
            <Text style={styles.skipText}>Saltar</Text>
          </Pressable>
        </View>

        <View style={[styles.copy, compact && styles.copyCompact]}>
          <Text style={styles.kicker}>Paso {index + 1} de {slides.length}</Text>
          <Text style={[styles.title, compact && styles.titleCompact]}>{slide.title}</Text>
          <Text style={[styles.body, veryCompact && styles.bodyCompact]}>{slide.body}</Text>
        </View>

        <View style={styles.pagination}>
          <View style={styles.progressTrack}><Animated.View style={[styles.progressFill, { width: progressWidth }]} /></View>
          <View style={styles.dots}>
            {slides.map((item, itemIndex) => (
              <Pressable
                accessibilityLabel={`Ir al paso ${itemIndex + 1}`}
                accessibilityRole="button"
                key={item.title}
                onPress={() => setIndex(itemIndex)}
                style={[styles.dot, index === itemIndex && styles.dotActive]}
              />
            ))}
          </View>
        </View>

        <View style={styles.actions}>
          <Pressable accessibilityLabel="Paso anterior" accessibilityRole="button" disabled={index === 0} onPress={previous} style={({ pressed }) => [styles.backButton, index === 0 && styles.disabled, pressed && styles.pressed]}>
            <Ionicons color={colors.ink} name="chevron-back" size={21} />
          </Pressable>
          <View style={styles.nextButton}><Button label={index === slides.length - 1 ? 'Entrar al club' : 'Siguiente'} onPress={next} /></View>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  wrap: { flex: 1, paddingHorizontal: 18, paddingTop: 12, paddingBottom: 18 },
  wrapCompact: { paddingTop: 6, paddingBottom: 10 },
  backgroundShapes: { ...StyleSheet.absoluteFillObject, overflow: 'hidden' },
  backgroundNumber: { position: 'absolute', right: -18, top: '42%', color: '#11121712', fontSize: 210, lineHeight: 220, fontWeight: '900', letterSpacing: -18 },
  backgroundNumberLeft: { left: -26, right: undefined },
  backgroundCircle: { position: 'absolute', width: 270, height: 270, borderRadius: 135, right: -105, bottom: 78, backgroundColor: '#FFFFFF20' },
  backgroundCircleLeft: { left: -115, right: undefined },
  backgroundFrame: { position: 'absolute', width: 190, height: 190, left: -92, bottom: 24, borderWidth: 2, borderColor: '#11121716', transform: [{ rotate: '18deg' }] },
  backgroundFrameHigh: { left: undefined, right: -94, bottom: 150, transform: [{ rotate: '-14deg' }] },
  topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  brand: { minHeight: 40, paddingHorizontal: 14, borderRadius: 20, backgroundColor: colors.ink, flexDirection: 'row', alignItems: 'center', gap: 8 },
  brandDot: { width: 10, height: 10, borderRadius: 5 },
  brandText: { color: colors.white, fontSize: 14, fontWeight: '900' },
  skip: { minHeight: 40, paddingHorizontal: 14, borderRadius: 20, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, justifyContent: 'center' },
  skipText: { color: colors.muted, fontSize: 13, fontWeight: '800' },
  copy: { gap: 6, marginTop: 52 },
  copyCompact: { gap: 3, marginTop: 28 },
  kicker: { color: '#11121799', fontSize: 11, fontWeight: '900', letterSpacing: 0.8, textTransform: 'uppercase' },
  title: { minHeight: 80, color: colors.ink, fontSize: 38, lineHeight: 40, fontWeight: '800', letterSpacing: -1.4 },
  titleCompact: { minHeight: 66, fontSize: 31, lineHeight: 33, letterSpacing: -1 },
  body: { minHeight: 44, color: '#111217A8', fontSize: 16, lineHeight: 22 },
  bodyCompact: { fontSize: 14, lineHeight: 18 },
  pagination: { gap: 7, marginTop: 20 },
  progressTrack: { height: 6, borderRadius: 3, backgroundColor: '#FFFFFF66', overflow: 'hidden' },
  progressFill: { height: 6, borderRadius: 3, backgroundColor: colors.ink },
  dots: { flexDirection: 'row', justifyContent: 'center', gap: 7 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#FFFFFF99' },
  dotActive: { width: 24, backgroundColor: colors.ink },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 'auto' },
  backButton: { width: 54, height: 54, borderRadius: 18, backgroundColor: '#FFFFFFAA', borderWidth: 1, borderColor: '#FFFFFFCC', alignItems: 'center', justifyContent: 'center' },
  nextButton: { flex: 1 },
  disabled: { opacity: 0.35 },
  pressed: { opacity: 0.65 },
});
