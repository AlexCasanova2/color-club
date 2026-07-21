import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Body, Card, ErrorText, Header, Screen, SkeletonBlock, Title } from '@/components/ui';
import { getActivity, getNotifications, markNotificationRead } from '@/lib/api';
import { colors } from '@/lib/theme';
import type { ActivityItem, AppNotification } from '@/types/domain';

const statusText = {
  configuring: 'Programado',
  active: 'En juego',
  voting: 'Votación abierta',
  closed: 'Finalizado',
};

function ActivitySkeleton() {
  return <View style={styles.list}>{[0, 1, 2, 3].map((item) => <SkeletonBlock key={item} style={styles.skeletonItem} />)}</View>;
}

export function ActivityScreen({ userId, onOpenChallenge, onOpenFriends, onNotificationRead }: { userId: string; onOpenChallenge: (clubId: string, challengeId: string) => void; onOpenFriends: () => void; onNotificationRead: () => void }) {
  const [items, setItems] = useState<ActivityItem[]>([]);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void Promise.all([getActivity(userId), getNotifications(userId)])
      .then(([activityItems, notificationItems]) => { setItems(activityItems); setNotifications(notificationItems); })
      .catch((caught) => setError((caught as Error).message))
      .finally(() => setLoading(false));
  }, [userId]);

  async function openNotification(notification: AppNotification) {
    if (!notification.read_at) {
      await markNotificationRead(notification.id);
      setNotifications((current) => current.map((item) => item.id === notification.id ? { ...item, read_at: new Date().toISOString() } : item));
      onNotificationRead();
    }
    if (notification.type === 'challenge' && notification.related_club_id && notification.related_challenge_id) onOpenChallenge(notification.related_club_id, notification.related_challenge_id);
    if (notification.type === 'friend_request') onOpenFriends();
  }

  return (
    <Screen>
      <Header title="Color Club" />
      <View style={styles.heading}><Title>Actividad</Title><Body muted>Los retos en los que has participado, del más reciente al primero.</Body></View>
      <ErrorText message={error} />
      {loading ? <ActivitySkeleton /> : items.length === 0 && notifications.length === 0 ? (
        <Card style={styles.empty}><Title size="medium">Sin retos todavía</Title><Body muted>Cuando un club lance su primer reto aparecerá aquí.</Body></Card>
      ) : (
        <>
          {notifications.length > 0 && <Text style={styles.sectionTitle}>Notificaciones</Text>}
          {notifications.length > 0 && <View style={styles.list}>
            {notifications.map((notification) => (
              <Pressable key={notification.id} onPress={() => void openNotification(notification)} style={({ pressed }) => [styles.notificationItem, !notification.read_at && styles.notificationUnread, pressed && styles.pressed]}>
                <View style={styles.notificationIcon}><Text style={styles.notificationGlyph}>{notification.type === 'friend_request' ? '+' : notification.type === 'weekly_summary' ? '7' : '!'}</Text></View>
                <View style={styles.itemText}><Text style={styles.club}>{notification.title}</Text><Text style={styles.status}>{notification.body}</Text></View>
                {!notification.read_at && <View style={styles.unreadDot} />}
              </Pressable>
            ))}
          </View>}
          {items.length > 0 && <Text style={styles.sectionTitle}>Retos</Text>}
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
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  heading: { marginVertical: 26, gap: 8 },
  skeletonItem: { height: 104, borderRadius: 26 },
  empty: { gap: 12, backgroundColor: colors.orange, borderWidth: 0 },
  sectionTitle: { color: colors.ink, fontSize: 20, fontWeight: '900', marginTop: 8, marginBottom: 2 },
  list: { gap: 12 },
  item: { minHeight: 104, padding: 18, borderRadius: 26, flexDirection: 'row', alignItems: 'center', gap: 14 },
  notificationItem: { minHeight: 92, padding: 16, borderRadius: 24, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, flexDirection: 'row', alignItems: 'center', gap: 12 },
  notificationUnread: { borderColor: colors.ink, backgroundColor: colors.green },
  notificationIcon: { width: 42, height: 42, borderRadius: 15, backgroundColor: colors.green, alignItems: 'center', justifyContent: 'center' },
  notificationGlyph: { color: colors.ink, fontSize: 16, fontWeight: '900' },
  unreadDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.danger },
  pressed: { opacity: 0.65 },
  swatch: { width: 50, height: 50, borderRadius: 18, borderWidth: 4, borderColor: '#FFFFFF88' },
  itemText: { flex: 1, gap: 4 },
  club: { color: colors.ink, fontSize: 18, fontWeight: '800' },
  status: { color: colors.ink, fontSize: 13, opacity: 0.7 },
  meta: { alignItems: 'flex-end', gap: 6 },
  ownStatus: { color: colors.ink, fontSize: 11, fontWeight: '700' },
  arrow: { color: colors.ink, fontSize: 19 },
});
