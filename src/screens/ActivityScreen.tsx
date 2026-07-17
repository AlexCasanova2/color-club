import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { Body, Card, ErrorText, Eyebrow, Header, Screen, Title } from '@/components/ui';
import { getActivity } from '@/lib/api';
import { colors } from '@/lib/theme';
import type { ActivityItem } from '@/types/domain';

const statusText = {
  configuring: 'Programado',
  active: 'En juego',
  voting: 'Votación abierta',
  closed: 'Finalizado',
};

export function ActivityScreen({ userId, onOpenChallenge }: { userId: string; onOpenChallenge: (clubId: string, challengeId: string) => void }) {
  const [items, setItems] = useState<ActivityItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void getActivity(userId)
      .then(setItems)
      .catch((caught) => setError((caught as Error).message))
      .finally(() => setLoading(false));
  }, [userId]);

  return (
    <Screen>
      <Header title="Color Club" />
      <View style={styles.heading}><Eyebrow>Tu recorrido</Eyebrow><Title>Actividad</Title><Body muted>Los retos en los que has participado, del más reciente al primero.</Body></View>
      <ErrorText message={error} />
      {loading ? <ActivityIndicator style={styles.loader} color={colors.coral} /> : items.length === 0 ? (
        <Card style={styles.empty}><Title size="medium">Sin retos todavía</Title><Body muted>Cuando un club lance su primer reto aparecerá aquí.</Body></Card>
      ) : (
        <View style={styles.list}>
          {items.map((item) => (
            <Pressable key={item.id} onPress={() => onOpenChallenge(item.club_id, item.id)} style={({ pressed }) => [styles.item, pressed && styles.pressed]}>
              <View style={[styles.swatch, { backgroundColor: item.shared_color ?? colors.line }]} />
              <View style={styles.itemText}>
                <Text style={styles.club}>{item.club_name}</Text>
                <Text style={styles.status}>{statusText[item.status]}</Text>
              </View>
              <View style={styles.meta}>
                <Text style={styles.ownStatus}>{item.participant_status === 'submitted' ? 'Enviado' : item.participant_status === 'disqualified' ? 'No completado' : 'Pendiente'}</Text>
                <Text style={styles.arrow}>→</Text>
              </View>
            </Pressable>
          ))}
        </View>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  heading: { marginVertical: 26, gap: 8 },
  loader: { marginTop: 70 },
  empty: { gap: 12 },
  list: { gap: 10 },
  item: { minHeight: 86, padding: 14, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, borderRadius: 16, flexDirection: 'row', alignItems: 'center', gap: 14 },
  pressed: { opacity: 0.65 },
  swatch: { width: 42, height: 42, borderRadius: 21 },
  itemText: { flex: 1, gap: 4 },
  club: { color: colors.ink, fontSize: 16, fontWeight: '600' },
  status: { color: colors.muted, fontSize: 13 },
  meta: { alignItems: 'flex-end', gap: 6 },
  ownStatus: { color: colors.coral, fontSize: 11, fontWeight: '600' },
  arrow: { color: colors.muted, fontSize: 17 },
});
