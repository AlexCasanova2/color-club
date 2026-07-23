import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Body, Card, ErrorText, Header, Screen, SkeletonBlock, Title } from '@/components/ui';
import { deleteNotification, deleteNotifications, getActivity, getNotifications, markAllNotificationsRead, markNotificationRead, respondClubInvite } from '@/lib/api';
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

function NotificationRow({ notification, selected, selecting, responding, onOpen, onDelete, onToggleSelect, onRespondInvite }: { notification: AppNotification; selected: boolean; selecting: boolean; responding: boolean; onOpen: () => void; onDelete: () => void; onToggleSelect: () => void; onRespondInvite: (accept: boolean) => void }) {
  const iconName = notification.type === 'friend_request' ? 'person-add-outline' : notification.type === 'club_invite' ? 'people-outline' : notification.type === 'weekly_summary' ? 'calendar-outline' : 'color-palette-outline';
  const tint = notification.type === 'friend_request' ? colors.blue : notification.type === 'club_invite' ? colors.lavender : notification.type === 'weekly_summary' ? colors.orange : colors.green;

  return (
    <View style={[styles.notificationItem, { backgroundColor: notification.read_at ? colors.surface : tint }, selected && styles.notificationSelected]}>
      <Pressable onLongPress={onToggleSelect} onPress={selecting ? onToggleSelect : onOpen} style={({ pressed }) => [styles.notificationMain, pressed && styles.pressed]}>
        {selecting && (
          <View style={[styles.selectCircle, selected && styles.selectCircleActive]}>
            {selected && <Ionicons color={colors.ink} name="checkmark" size={16} />}
          </View>
        )}
        <View style={styles.notificationIcon}><Ionicons color={colors.ink} name={iconName} size={18} /></View>
        <View style={styles.notificationCopy}>
          <Text numberOfLines={1} style={styles.notificationTitle}>{notification.title}</Text>
          {notification.type === 'club_invite' && <Text numberOfLines={2} style={styles.notificationBody}>{notification.body}</Text>}
        </View>
        {!notification.read_at && <View style={styles.unreadDot} />}
      </Pressable>
      {!selecting && notification.type === 'club_invite' && notification.related_invite_id && (
        <View style={styles.inviteActions}>
          <Pressable disabled={responding} onPress={() => onRespondInvite(true)} style={({ pressed }) => [styles.acceptInvite, responding && styles.headerPillDisabled, pressed && styles.pressed]}><Text style={styles.acceptInviteText}>Aceptar</Text></Pressable>
          <Pressable disabled={responding} onPress={() => onRespondInvite(false)} style={({ pressed }) => [styles.declineInvite, responding && styles.headerPillDisabled, pressed && styles.pressed]}><Ionicons color={colors.ink} name="close" size={17} /></Pressable>
        </View>
      )}
      {!selecting && (
        <Pressable accessibilityLabel="Borrar notificación" accessibilityRole="button" onPress={onDelete} style={({ pressed }) => [styles.deleteNotification, pressed && styles.pressed]}>
          <Ionicons color={colors.danger} name="trash-outline" size={18} />
        </Pressable>
      )}
    </View>
  );
}

export function ActivityScreen({ userId, onOpenChallenge, onOpenClub, onOpenFriends, onNotificationRead }: { userId: string; onOpenChallenge: (clubId: string, challengeId: string) => void; onOpenClub: (clubId: string) => void; onOpenFriends: () => void; onNotificationRead: () => void }) {
  const [items, setItems] = useState<ActivityItem[]>([]);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [selectedNotifications, setSelectedNotifications] = useState<string[]>([]);
  const [selectingNotifications, setSelectingNotifications] = useState(false);
  const [notificationActionsOpen, setNotificationActionsOpen] = useState(false);
  const [respondingInviteId, setRespondingInviteId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const unreadNotifications = notifications.filter((notification) => !notification.read_at).length;

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
    if (notification.type === 'club_invite' && notification.related_club_id) onOpenClub(notification.related_club_id);
    if (notification.type === 'friend_request') onOpenFriends();
  }

  async function respondInvite(notification: AppNotification, accept: boolean) {
    if (!notification.related_invite_id) return;
    setRespondingInviteId(notification.related_invite_id);
    try {
      const clubId = await respondClubInvite(notification.related_invite_id, accept);
      setNotifications((current) => current.filter((item) => item.id !== notification.id));
      if (!notification.read_at) onNotificationRead();
      if (accept) onOpenClub(clubId);
    } catch (caught) { setError((caught as Error).message); }
    setRespondingInviteId(null);
  }

  async function removeNotification(notification: AppNotification) {
    try {
      await deleteNotification(notification.id);
      setNotifications((current) => current.filter((item) => item.id !== notification.id));
      if (!notification.read_at) onNotificationRead();
    }
    catch (caught) { setError((caught as Error).message); }
  }

  function decrementUnread(count: number) {
    Array.from({ length: count }).forEach(() => onNotificationRead());
  }

  function toggleNotificationSelection(notificationId: string) {
    setSelectingNotifications(true);
    setSelectedNotifications((current) => current.includes(notificationId) ? current.filter((id) => id !== notificationId) : [...current, notificationId]);
  }

  async function markEveryNotificationRead() {
    if (!unreadNotifications) return;
    try {
      await markAllNotificationsRead(userId);
      const readAt = new Date().toISOString();
      setNotifications((current) => current.map((notification) => ({ ...notification, read_at: notification.read_at ?? readAt })));
      decrementUnread(unreadNotifications);
    }
    catch (caught) { setError((caught as Error).message); }
  }

  async function deleteSelectedNotifications() {
    if (!selectedNotifications.length) return;
    const selected = notifications.filter((notification) => selectedNotifications.includes(notification.id));
    try {
      await deleteNotifications(selected.map((notification) => notification.id));
      setNotifications((current) => current.filter((notification) => !selectedNotifications.includes(notification.id)));
      decrementUnread(selected.filter((notification) => !notification.read_at).length);
      setSelectedNotifications([]);
      setSelectingNotifications(false);
    }
    catch (caught) { setError((caught as Error).message); }
  }

  function cancelNotificationSelection() {
    setSelectedNotifications([]);
    setSelectingNotifications(false);
  }

  function startNotificationSelection() {
    setNotificationActionsOpen(false);
    setSelectingNotifications(true);
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
          {notifications.length > 0 && (
            <View style={styles.notificationHeader}>
              <View style={styles.notificationHeaderTop}>
                <Text style={styles.sectionTitle}>Notificaciones</Text>
                <Pressable accessibilityLabel="Opciones de notificaciones" accessibilityRole="button" onPress={() => setNotificationActionsOpen((open) => !open)} style={({ pressed }) => [styles.settingsButton, notificationActionsOpen && styles.settingsButtonOpen, pressed && styles.pressed]}>
                  <Ionicons color={notificationActionsOpen ? colors.white : colors.ink} name="settings-outline" size={19} />
                </Pressable>
              </View>
              {notificationActionsOpen && (
                <View style={styles.notificationActionsMenu}>
                  <Pressable disabled={!unreadNotifications} onPress={() => void markEveryNotificationRead().finally(() => setNotificationActionsOpen(false))} style={({ pressed }) => [styles.menuAction, !unreadNotifications && styles.headerPillDisabled, pressed && styles.pressed]}><Ionicons color={colors.ink} name="checkmark-done-outline" size={18} /><Text style={styles.menuActionText}>Marcar todo como leído</Text></Pressable>
                  <Pressable onPress={startNotificationSelection} style={({ pressed }) => [styles.menuAction, pressed && styles.pressed]}><Ionicons color={colors.ink} name="checkbox-outline" size={18} /><Text style={styles.menuActionText}>Seleccionar notificaciones</Text></Pressable>
                </View>
              )}
            </View>
          )}
          {selectingNotifications && notifications.length > 0 && (
            <View style={styles.bulkBar}>
              <Text style={styles.bulkText}>{selectedNotifications.length} seleccionada{selectedNotifications.length === 1 ? '' : 's'}</Text>
              <Pressable disabled={!selectedNotifications.length} onPress={() => void deleteSelectedNotifications()} style={({ pressed }) => [styles.bulkDelete, !selectedNotifications.length && styles.headerPillDisabled, pressed && styles.pressed]}><Ionicons color={colors.white} name="trash-outline" size={17} /><Text style={styles.bulkDeleteText}>Borrar</Text></Pressable>
            </View>
          )}
          {notifications.length > 0 && <View style={styles.list}>
            {notifications.map((notification) => (
              <NotificationRow
                key={notification.id}
                notification={notification}
                selected={selectedNotifications.includes(notification.id)}
                selecting={selectingNotifications}
                responding={respondingInviteId === notification.related_invite_id}
                onOpen={() => void openNotification(notification)}
                onDelete={() => void removeNotification(notification)}
                onRespondInvite={(accept) => void respondInvite(notification, accept)}
                onToggleSelect={() => toggleNotificationSelection(notification.id)}
              />
            ))}
          </View>}
          {items.length > 0 && <View style={styles.challengeSectionHeader}><Text style={styles.sectionTitle}>Retos</Text><Text style={styles.challengeSectionMeta}>{items.length} en total</Text></View>}
          <View style={styles.challengeList}>
            {items.map((item) => {
              const ownStatus = item.participant_status === 'submitted' ? 'Enviado' : item.participant_status === 'disqualified' ? 'No completado' : 'Pendiente';
              return (
                <Pressable key={item.id} onPress={() => onOpenChallenge(item.club_id, item.id)} style={({ pressed }) => [styles.challengeCard, pressed && styles.challengePressed]}>
                  <View style={[styles.challengeShape, { backgroundColor: item.shared_color ?? colors.lavender }]} />
                  <View style={styles.challengeCardHeader}>
                    <Text style={styles.challengeKicker}>{statusText[item.status].toUpperCase()}</Text>
                    <View style={styles.challengeArrow}><Ionicons color={colors.ink} name="arrow-forward" size={18} /></View>
                  </View>
                  <Text numberOfLines={2} style={styles.challengeClub}>{item.club_name}</Text>
                  <View style={styles.challengeFooter}>
                    <View style={[styles.challengeColorDot, { backgroundColor: item.shared_color ?? colors.lavender }]} />
                    <Text style={styles.challengeOwnStatus}>{ownStatus}</Text>
                  </View>
                </Pressable>
              );
            })}
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
  sectionTitle: { color: colors.ink, fontSize: 20, fontWeight: '900' },
  list: { gap: 9 },
  notificationHeader: { marginTop: 10, marginBottom: 2, gap: 12 },
  notificationHeaderTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  settingsButton: { width: 42, height: 42, borderRadius: 16, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, alignItems: 'center', justifyContent: 'center' },
  settingsButtonOpen: { backgroundColor: colors.ink, borderColor: colors.ink },
  notificationActionsMenu: { padding: 8, borderRadius: 22, backgroundColor: colors.ink, gap: 6 },
  menuAction: { minHeight: 46, borderRadius: 16, paddingHorizontal: 12, backgroundColor: colors.white, flexDirection: 'row', alignItems: 'center', gap: 10 },
  menuActionText: { color: colors.ink, fontSize: 13, fontWeight: '900' },
  headerPillDisabled: { opacity: 0.42 },
  bulkBar: { minHeight: 54, padding: 8, paddingLeft: 15, borderRadius: 22, backgroundColor: colors.lavender, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  bulkText: { color: colors.ink, fontSize: 13, fontWeight: '900' },
  bulkDelete: { minHeight: 38, borderRadius: 19, paddingHorizontal: 12, backgroundColor: colors.ink, flexDirection: 'row', alignItems: 'center', gap: 6 },
  bulkDeleteText: { color: colors.white, fontSize: 12, fontWeight: '900' },
  notificationItem: { minHeight: 68, padding: 9, paddingLeft: 12, borderRadius: 21, flexDirection: 'row', alignItems: 'center', gap: 8 },
  notificationMain: { flex: 1, minHeight: 50, flexDirection: 'row', alignItems: 'center', gap: 11 },
  notificationSelected: { borderWidth: 2, borderColor: colors.ink, backgroundColor: colors.yellow },
  selectCircle: { width: 28, height: 28, borderRadius: 14, borderWidth: 2, borderColor: colors.ink, alignItems: 'center', justifyContent: 'center' },
  selectCircleActive: { backgroundColor: colors.white },
  notificationIcon: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.white, alignItems: 'center', justifyContent: 'center' },
  notificationCopy: { flex: 1, minWidth: 0, minHeight: 40, justifyContent: 'center' },
  notificationTitle: { color: colors.ink, fontSize: 15, lineHeight: 20, fontWeight: '900' },
  notificationBody: { color: colors.ink, opacity: 0.72, fontSize: 12, lineHeight: 16, fontWeight: '700' },
  inviteActions: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  acceptInvite: { height: 40, borderRadius: 20, paddingHorizontal: 12, backgroundColor: colors.ink, alignItems: 'center', justifyContent: 'center' },
  acceptInviteText: { color: colors.white, fontSize: 12, fontWeight: '900' },
  declineInvite: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.white, alignItems: 'center', justifyContent: 'center' },
  deleteNotification: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.white, alignItems: 'center', justifyContent: 'center' },
  unreadDot: { width: 9, height: 9, borderRadius: 5, backgroundColor: colors.danger },
  pressed: { opacity: 0.65 },
  challengeSectionHeader: { marginTop: 24, marginBottom: 4, flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },
  challengeSectionMeta: { color: colors.muted, fontSize: 12, fontWeight: '700' },
  challengeList: { gap: 12 },
  challengeCard: { minHeight: 156, padding: 20, borderRadius: 28, backgroundColor: '#ECEBE6', borderWidth: 1, borderColor: colors.line, overflow: 'hidden', justifyContent: 'space-between' },
  challengePressed: { opacity: 0.88, transform: [{ scale: 0.99 }] },
  challengeShape: { position: 'absolute', width: 150, height: 150, borderRadius: 52, right: -55, bottom: -65, opacity: 0.28, transform: [{ rotate: '24deg' }] },
  challengeCardHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  challengeKicker: { color: colors.muted, fontSize: 10, fontWeight: '900', letterSpacing: 1.1 },
  challengeArrow: { width: 38, height: 38, borderRadius: 19, backgroundColor: colors.white, alignItems: 'center', justifyContent: 'center' },
  challengeClub: { maxWidth: '74%', color: colors.ink, fontSize: 29, lineHeight: 31, fontWeight: '900', letterSpacing: -0.7 },
  challengeFooter: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  challengeColorDot: { width: 12, height: 12, borderRadius: 5, borderWidth: 2, borderColor: colors.white },
  challengeOwnStatus: { color: colors.ink, opacity: 0.68, fontSize: 12, fontWeight: '800' },
});
