import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Body, Button, ErrorText, Eyebrow, Header, Screen, Title } from '@/components/ui';
import { createChallenge } from '@/lib/api';
import { colorChoices, colors } from '@/lib/theme';
import type { DurationPreset } from '@/types/domain';

const durations: Array<{ value: DurationPreset; label: string }> = [
  { value: '24h', label: '24 horas' },
  { value: '48h', label: '48 horas' },
  { value: '1week', label: '1 semana' },
];

export function NewChallengeScreen({ clubId, onBack, onCreated }: { clubId: string; onBack: () => void; onCreated: (id: string) => void }) {
  const [color, setColor] = useState(colorChoices[0]!.hex);
  const [duration, setDuration] = useState<DurationPreset>('24h');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function launch() {
    setLoading(true);
    setError(null);
    try { onCreated(await createChallenge(clubId, color, duration)); }
    catch (caught) { setError((caught as Error).message); setLoading(false); }
  }

  return (
    <Screen>
      <Header title="Nuevo reto" onBack={onBack} />
      <View style={styles.heading}><Eyebrow>Configuración</Eyebrow><Title>Elige las reglas</Title><Body muted>Todo el club buscará el mismo color.</Body></View>
      <Text style={styles.label}>Color compartido</Text>
      <View style={styles.palette}>
        {colorChoices.map((choice) => (
          <Pressable key={choice.hex} accessibilityLabel={choice.name} onPress={() => setColor(choice.hex)} style={[styles.colorOption, { backgroundColor: choice.hex }, color === choice.hex && styles.colorSelected]}>
            {color === choice.hex && <Text style={[styles.check, choice.hex === '#E9E6DF' && styles.checkDark]}>✓</Text>}
          </Pressable>
        ))}
      </View>
      <Text style={styles.label}>Tiempo para encontrar seis fotos</Text>
      <View style={styles.durationList}>
        {durations.map((item) => (
          <Pressable key={item.value} onPress={() => setDuration(item.value)} style={[styles.duration, duration === item.value && styles.durationSelected]}>
            <Text style={[styles.durationText, duration === item.value && styles.durationTextSelected]}>{item.label}</Text>
          </Pressable>
        ))}
      </View>
      <View style={styles.summary}>
        <View style={[styles.summaryColor, { backgroundColor: color }]} />
        <Body>Empieza ahora · {durations.find((item) => item.value === duration)?.label} · 6 fotos</Body>
      </View>
      <ErrorText message={error} />
      <Button label="Lanzar reto al club" onPress={launch} loading={loading} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  heading: { marginVertical: 24, gap: 8 },
  label: { color: colors.muted, fontSize: 13, fontWeight: '600', marginTop: 28, marginBottom: 14 },
  palette: { flexDirection: 'row', flexWrap: 'wrap', gap: 14 },
  colorOption: { width: 54, height: 54, borderRadius: 27, justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: colors.line },
  colorSelected: { borderWidth: 3, borderColor: colors.ink },
  check: { color: colors.white, fontSize: 19, fontWeight: '700' },
  checkDark: { color: colors.ink },
  durationList: { flexDirection: 'row', gap: 8 },
  duration: { flex: 1, borderWidth: 1, borderColor: colors.line, borderRadius: 14, backgroundColor: colors.surface, paddingVertical: 17, alignItems: 'center' },
  durationSelected: { borderColor: colors.ink, backgroundColor: colors.ink },
  durationText: { color: colors.ink, fontWeight: '600', fontSize: 13 },
  durationTextSelected: { color: colors.white },
  summary: { marginVertical: 28, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, borderRadius: 14, padding: 18, flexDirection: 'row', alignItems: 'center', gap: 12 },
  summaryColor: { width: 26, height: 26, borderRadius: 13 },
});
