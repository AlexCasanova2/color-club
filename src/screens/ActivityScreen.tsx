import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Body, Card, ErrorText, Header, Screen, SkeletonBlock, Title } from '@/components/ui';
import { getActivity } from '@/lib/api';
import { colors } from '@/lib/theme';
import type { ActivityItem } from '@/types/domain';

const statusText = {
  configuring: 'Programado',
  active: 'En juego',
  voting: 'Votación abierta',
  closed: 'Finalizado',
};

function ActivitySkeleton() {
  return <View style={styles.list}>{[0, 1, 2, 3].map((item) => <SkeletonBlock key={item} style={styles.skeletonItem} />)}</View>;
}

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
      <View style={styles.heading}><Title>Actividad</Title><Body muted>Los retos en los que has participado, del más reciente al primero.</Body></View>
      <ErrorText message={error} />
      {loading ? <ActivitySkeleton /> : items.length === 0 ? (
        <Card style={styles.empty}><Title size="medium">Sin retos todavía</Title><Body muted>Cuando un club lance su primer reto aparecerá aquí.</Body></Card>
      ) : (
        <View style={styles.list}>
          {items.map((item, index) => (
            <Pressable key={item.id} onPress={() => onOpenChallenge(item.club_id, item.id)} style={({ pressed }) => [styles.item, { backgroundColor: [colors.blue, colors.orange, colors.lavender, colors.green][index % 4] }, pressed && styles.pressed]}>
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
  skeletonItem: { height: 104, borderRadius: 26 },
  empty: { gap: 12, backgroundColor: colors.orange, borderWidth: 0 },
  list: { gap: 12 },
  item: { minHeight: 104, padding: 18, borderRadius: 26, flexDirection: 'row', alignItems: 'center', gap: 14 },
  pressed: { opacity: 0.65 },
  swatch: { width: 50, height: 50, borderRadius: 18, borderWidth: 4, borderColor: '#FFFFFF88' },
  itemText: { flex: 1, gap: 4 },
  club: { color: colors.ink, fontSize: 18, fontWeight: '800' },
  status: { color: colors.ink, fontSize: 13, opacity: 0.7 },
  meta: { alignItems: 'flex-end', gap: 6 },
  ownStatus: { color: colors.ink, fontSize: 11, fontWeight: '700' },
  arrow: { color: colors.ink, fontSize: 19 },
});
