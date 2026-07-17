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
      <Header title="NUEVO RETO" onBack={onBack} />
      <View style={styles.heading}><Eyebrow>Paso 1 de 1</Eyebrow><Title>Elige las reglas</Title><Body muted>En v1 todo el club buscará el mismo color.</Body></View>
      <Text style={styles.label}>Color compartido</Text>
      <View style={styles.palette}>
        {colorChoices.map((choice) => (
          <Pressable key={choice.hex} accessibilityLabel={choice.name} onPress={() => setColor(choice.hex)} style={[styles.colorOption, { backgroundColor: choice.hex }, color === choice.hex && styles.colorSelected]}>
            {color === choice.hex && <Text style={[styles.check, choice.hex === '#E9E6DF' && styles.checkDark]}>✓</Text>}
          </Pressable>
        ))}
      </View>
      <Text style={styles.label}>Tiempo para encontrar 6 fotos</Text>
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
  heading: { marginVertical: 20, gap: 8 },
  label: { color: colors.ink, fontSize: 12, fontWeight: '900', letterSpacing: 1.2, textTransform: 'uppercase', marginTop: 25, marginBottom: 12 },
  palette: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  colorOption: { width: 62, height: 62, borderRadius: 31, justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: colors.line },
  colorSelected: { borderWidth: 4, borderColor: colors.ink },
  check: { color: colors.white, fontSize: 22, fontWeight: '900' },
  checkDark: { color: colors.ink },
  durationList: { flexDirection: 'row', gap: 8 },
  duration: { flex: 1, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface, paddingVertical: 17, alignItems: 'center' },
  durationSelected: { borderColor: colors.ink, backgroundColor: colors.ink },
  durationText: { color: colors.ink, fontWeight: '800', fontSize: 13 },
  durationTextSelected: { color: colors.white },
  summary: { marginVertical: 28, borderTopWidth: 1, borderBottomWidth: 1, borderColor: colors.line, paddingVertical: 18, flexDirection: 'row', alignItems: 'center', gap: 12 },
  summaryColor: { width: 26, height: 26, borderRadius: 13 },
});
