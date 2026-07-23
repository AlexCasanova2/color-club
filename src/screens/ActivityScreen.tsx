import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Body, Card, ErrorText, Header, Screen, SkeletonBlock, Title } from '@/components/ui';
import { deleteNotification, deleteNotifications, getNotifications, markAllNotificationsRead, markNotificationRead, respondClubInvite } from '@/lib/api';
import { colors } from '@/lib/theme';
import type { AppNotification } from '@/types/domain';

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
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [selectedNotifications, setSelectedNotifications] = useState<string[]>([]);
  const [selectingNotifications, setSelectingNotifications] = useState(false);
  const [notificationActionsOpen, setNotificationActionsOpen] = useState(false);
  const [respondingInviteId, setRespondingInviteId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const unreadNotifications = notifications.filter((notification) => !notification.read_at).length;

  useEffect(() => {
    void getNotifications(userId)
      .then(setNotifications)
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
      <View style={styles.heading}>
        <View style={styles.headingShape} />
        <View style={styles.headingRing} />
        <Text style={styles.headingKicker}>Tu movimiento</Text>
        <Title>Actividad</Title>
        <Body>Invitaciones, solicitudes y señales nuevas de tus clubs.</Body>
      </View>
      <ErrorText message={error} />
      {loading ? <ActivitySkeleton /> : notifications.length === 0 ? (
        <Card style={styles.empty}><Title size="medium">Sin actividad todavía</Title><Body muted>Cuando haya invitaciones, solicitudes o avisos aparecerán aquí.</Body></Card>
      ) : (
        <>
          {notifications.length > 0 && (
            <View style={styles.notificationHeader}>
              <View style={styles.notificationHeaderGlow} />
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
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  heading: { minHeight: 178, marginTop: 22, marginBottom: 22, padding: 24, borderRadius: 30, backgroundColor: colors.orange, overflow: 'hidden', justifyContent: 'flex-end', gap: 8 },
  headingKicker: { color: colors.ink, opacity: 0.65, fontSize: 12, fontWeight: '900', letterSpacing: 1.1, textTransform: 'uppercase' },
  headingShape: { position: 'absolute', width: 126, height: 126, borderRadius: 42, backgroundColor: colors.pink, right: -26, top: -28, transform: [{ rotate: '18deg' }] },
  headingRing: { position: 'absolute', width: 94, height: 94, borderRadius: 47, borderWidth: 20, borderColor: colors.yellow, right: 34, bottom: -42 },
  skeletonItem: { height: 104, borderRadius: 26 },
  empty: { gap: 12, backgroundColor: colors.orange, borderWidth: 0 },
  sectionTitle: { color: colors.ink, fontSize: 20, fontWeight: '900' },
  list: { gap: 9 },
  notificationHeader: { position: 'relative', zIndex: 5, marginTop: 10, marginBottom: 14, padding: 14, borderRadius: 26, backgroundColor: colors.lavender, overflow: 'visible', gap: 12 },
  notificationHeaderGlow: { position: 'absolute', width: 78, height: 78, borderRadius: 28, backgroundColor: colors.green, right: 48, top: -34, opacity: 0.72, transform: [{ rotate: '-15deg' }] },
  notificationHeaderTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  settingsButton: { width: 42, height: 42, borderRadius: 16, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, alignItems: 'center', justifyContent: 'center' },
  settingsButtonOpen: { backgroundColor: colors.ink, borderColor: colors.ink },
  notificationActionsMenu: { position: 'absolute', right: 0, top: 50, width: 240, padding: 8, borderRadius: 22, backgroundColor: colors.ink, gap: 6, zIndex: 20, elevation: 12, shadowColor: colors.ink, shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.16, shadowRadius: 18 },
  menuAction: { minHeight: 46, borderRadius: 16, paddingHorizontal: 12, backgroundColor: colors.white, flexDirection: 'row', alignItems: 'center', gap: 10 },
  menuActionText: { color: colors.ink, fontSize: 13, fontWeight: '900' },
  headerPillDisabled: { opacity: 0.42 },
  bulkBar: { minHeight: 54, padding: 8, paddingLeft: 15, borderRadius: 22, backgroundColor: colors.yellow, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
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
});
