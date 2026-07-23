import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Animated, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { Body, Button, Card, ErrorText, Header, Screen, Title } from '@/components/ui';
import { getFriendshipWithUser, getPublicProfile, getUserStats, removeFriendship, respondFriendRequest, sendFriendRequest } from '@/lib/api';
import { colors } from '@/lib/theme';
import type { Friendship, PublicProfile, UserStats } from '@/types/domain';

const emptyStats: UserStats = {
  total_challenges: 0,
  submitted_collages: 0,
  wins: 0,
  best_challenge_position: null,
  best_season_position: null,
  seasons_played: 0,
  votes_received: 0,
  votes_cast: 0,
};

function readableTextColor(hex: string) {
  const normalized = hex.replace('#', '');
  if (!/^[0-9a-f]{6}$/i.test(normalized)) return colors.ink;
  const red = parseInt(normalized.slice(0, 2), 16);
  const green = parseInt(normalized.slice(2, 4), 16);
  const blue = parseInt(normalized.slice(4, 6), 16);
  const luminance = (red * 299 + green * 587 + blue * 114) / 1000;
  return luminance < 140 ? colors.white : colors.ink;
}

export function PublicProfileScreen({ userId, viewerUserId, onBack }: { userId: string; viewerUserId: string; onBack: () => void }) {
  const [profile, setProfile] = useState<PublicProfile | null>(null);
  const [stats, setStats] = useState<UserStats>(emptyStats);
  const [friendship, setFriendship] = useState<Friendship | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setProfile(null);
    setError(null);
    try {
      const [profileData, friendshipData] = await Promise.all([
        getPublicProfile(userId),
        userId === viewerUserId ? Promise.resolve(null) : getFriendshipWithUser(viewerUserId, userId),
      ]);
      const statsData = await getUserStats(userId);
      setProfile(profileData);
      setStats(statsData);
      setFriendship(friendshipData);
    } catch (caught) { setError((caught as Error).message); }
  }

  useEffect(() => {
    void load();
  }, [userId]);

  async function sendRequest() {
    if (!profile) return;
    setSaving(true);
    setError(null);
    try { await sendFriendRequest(profile.username); await load(); }
    catch (caught) { setError((caught as Error).message); }
    setSaving(false);
  }

  async function respondPending(accept: boolean) {
    if (!friendship) return;
    setSaving(true);
    setError(null);
    try { await respondFriendRequest(friendship.id, accept); await load(); }
    catch (caught) { setError((caught as Error).message); }
    setSaving(false);
  }

  function confirmRemoveFriend() {
    if (!friendship || !profile) return;
    Alert.alert('Eliminar amistad', `¿Quieres eliminar a ${profile.display_name} de tus amigos?`, [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Eliminar', style: 'destructive', onPress: async () => {
        setSaving(true);
        setError(null);
        try { await removeFriendship(friendship.id); await load(); }
        catch (caught) { setError((caught as Error).message); }
        setSaving(false);
      } },
    ]);
  }

  return (
    <Screen stickyHeader>
      <Header title="Perfil" onBack={onBack} />
      <ErrorText message={error} />
      {!profile && !error ? <ActivityIndicator style={styles.loader} color={colors.coral} /> : profile && (
        <>
          <View style={styles.profileHero}>
            <View style={styles.avatarWrap}>
              {profile.avatar_url ? <Image source={{ uri: profile.avatar_url }} style={styles.avatar} /> : <Text style={[styles.initial, { backgroundColor: profile.avatar_color || colors.ink }]}>{profile.display_name.charAt(0).toUpperCase()}</Text>}
            </View>
            <View style={styles.identity}>
              <Text style={styles.name}>{profile.display_name}</Text>
              <Text style={styles.username}>@{profile.username}</Text>
              {profile.status_text ? <Text style={styles.status}>{profile.status_text}</Text> : null}
            </View>
            <View style={styles.heroShape} />
          </View>

          {profile.bio ? <Card style={styles.bioCard}><Body muted>{profile.bio}</Body></Card> : null}

          {userId !== viewerUserId && friendship?.status === 'accepted' ? (
            <HoldActionButton backgroundColor={colors.danger} loading={saving} onComplete={confirmRemoveFriend} progressColor="#8F1F1C" textColor={colors.white} title="Quitar de amigos" />
          ) : userId !== viewerUserId && friendship?.status === 'pending' && friendship.requester_id === viewerUserId ? (
            <Pressable disabled style={[styles.pendingFriendButton, styles.disabled]}>
              <Text style={styles.pendingFriendText}>Solicitud enviada</Text>
            </Pressable>
          ) : userId !== viewerUserId && !friendship ? (
            <HoldActionButton backgroundColor={colors.green} loading={saving} onComplete={() => void sendRequest()} progressColor="#2E6B50" textColor={colors.ink} title="Enviar solicitud de amistad" />
          ) : userId !== viewerUserId && (
            <Card style={styles.actionsCard}>
              {friendship?.status === 'pending' && friendship.addressee_id === viewerUserId ? (
                <View style={styles.requestActions}>
                  <Button label="Aceptar solicitud" onPress={() => void respondPending(true)} loading={saving} />
                  <Button label="Ahora no" onPress={() => void respondPending(false)} disabled={saving} variant="secondary" />
                </View>
              ) : null}
            </Card>
          )}

          <View style={styles.detailGrid}>
            <View style={[styles.favoriteColorCard, { backgroundColor: profile.favorite_color || colors.lavender }]}>
              <Text style={[styles.favoriteColorLabel, { color: readableTextColor(profile.favorite_color || colors.lavender) }]}>Color favorito</Text>
              <Text style={[styles.detailValue, { color: readableTextColor(profile.favorite_color || colors.lavender) }]}>{profile.favorite_color || 'Sin definir'}</Text>
            </View>
          </View>

          <View style={styles.statsSection}>
            <View style={styles.statsGrid}>
              <StatCard label="Victorias" value={stats.wins} accent wide />
              <StatCard label="Participaciones" value={stats.total_challenges} />
              <StatCard label="Collages enviados" value={stats.submitted_collages} />
              <StatCard label="Mejor reto" value={stats.best_challenge_position ? `#${stats.best_challenge_position}` : '—'} />
              <StatCard label="Mejor temporada" value={stats.best_season_position ? `#${stats.best_season_position}` : '—'} />
              <StatCard label="Temporadas" value={stats.seasons_played} wide />
            </View>
          </View>

          <Card style={styles.achievementsCard}>
            <Title size="medium">Próximamente</Title>
          </Card>
        </>
      )}
    </Screen>
  );
}

function HoldActionButton({ backgroundColor, loading, onComplete, progressColor, textColor, title }: { backgroundColor: string; loading: boolean; onComplete: () => void; progressColor: string; textColor: string; title: string }) {
  const progress = useRef(new Animated.Value(0)).current;
  const completed = useRef(false);
  const hapticInterval = useRef<ReturnType<typeof setInterval> | null>(null);

  function stopHaptics() {
    if (!hapticInterval.current) return;
    clearInterval(hapticInterval.current);
    hapticInterval.current = null;
  }

  function beginHold() {
    if (loading) return;
    completed.current = false;
    progress.setValue(0);
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    stopHaptics();
    hapticInterval.current = setInterval(() => {
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }, 210);
    Animated.timing(progress, { toValue: 1, duration: 900, useNativeDriver: false }).start(({ finished }) => {
      stopHaptics();
      if (!finished || loading) return;
      completed.current = true;
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      onComplete();
    });
  }

  function endHold() {
    stopHaptics();
    if (completed.current || loading) return;
    progress.stopAnimation(() => {
      Animated.timing(progress, { toValue: 0, duration: 160, useNativeDriver: false }).start();
    });
  }

  return (
    <Pressable disabled={loading} onPressIn={beginHold} onPressOut={endHold} style={({ pressed }) => [styles.holdActionButton, { backgroundColor }, loading && styles.disabled, pressed && styles.pressed]}>
      <Animated.View pointerEvents="none" style={[styles.holdActionProgress, { backgroundColor: progressColor, width: progress.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }) }]} />
      {loading ? <ActivityIndicator color={textColor} /> : <Text style={[styles.holdActionText, { color: textColor }]}>{title}</Text>}
    </Pressable>
  );
}

function StatCard({ label, value, accent = false, wide = false }: { label: string; value: string | number; accent?: boolean; wide?: boolean }) {
  return (
    <View style={[styles.statCard, wide && styles.statCardWide, accent && styles.statCardAccent]}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  loader: { marginTop: 80 },
  profileHero: { minHeight: 154, marginTop: 22, padding: 22, borderRadius: 30, backgroundColor: colors.lavender, flexDirection: 'row', alignItems: 'center', gap: 16, overflow: 'hidden' },
  avatarWrap: { width: 78, height: 78, borderRadius: 39, backgroundColor: colors.ink, alignItems: 'center', justifyContent: 'center', zIndex: 2, overflow: 'hidden' },
  avatar: { width: 78, height: 78, borderRadius: 39 },
  initial: { width: 78, height: 78, borderRadius: 39, color: colors.white, fontSize: 28, lineHeight: 78, textAlign: 'center', fontWeight: '800' },
  identity: { flex: 1, gap: 3, zIndex: 2 },
  name: { color: colors.ink, fontSize: 23, fontWeight: '900' },
  username: { color: colors.ink, fontSize: 14, fontWeight: '700' },
  status: { alignSelf: 'flex-start', marginTop: 7, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 13, backgroundColor: colors.white, color: colors.ink, fontSize: 11, fontWeight: '900' },
  heroShape: { position: 'absolute', width: 98, height: 98, borderRadius: 32, backgroundColor: colors.pink, right: -32, top: -24, transform: [{ rotate: '24deg' }] },
  bioCard: { marginTop: 16, gap: 12, backgroundColor: colors.surface, borderColor: colors.line },
  actionsCard: { marginTop: 12, gap: 10, backgroundColor: colors.blue, borderWidth: 0 },
  pendingFriendButton: { minHeight: 54, marginTop: 12, borderRadius: 18, paddingHorizontal: 18, backgroundColor: colors.yellow, alignItems: 'center', justifyContent: 'center' },
  pendingFriendText: { color: colors.ink, fontSize: 15, fontWeight: '900' },
  holdActionButton: { minHeight: 54, marginTop: 12, borderRadius: 18, paddingHorizontal: 18, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  holdActionProgress: { position: 'absolute', left: 0, top: 0, bottom: 0 },
  holdActionText: { fontSize: 15, fontWeight: '900' },
  disabled: { opacity: 0.45 },
  pressed: { opacity: 0.75, transform: [{ translateY: 1 }] },
  requestActions: { gap: 8 },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  detailGrid: { marginTop: 14, flexDirection: 'row', gap: 10 },
  favoriteColorCard: { flex: 1, minHeight: 112, padding: 16, borderRadius: 26, justifyContent: 'space-between' },
  favoriteColorLabel: { color: colors.ink, opacity: 0.72, fontSize: 11, fontWeight: '900' },
  detailValue: { color: colors.ink, fontSize: 15, fontWeight: '900' },
  statsSection: { marginTop: 20, gap: 12 },
  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  statCard: { width: '48%', minHeight: 96, padding: 16, borderRadius: 24, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, justifyContent: 'center', gap: 8 },
  statCardWide: { width: '100%', minHeight: 106 },
  statCardAccent: { backgroundColor: colors.yellow, borderColor: colors.yellow },
  statValue: { color: colors.ink, fontSize: 24, lineHeight: 27, fontWeight: '900', letterSpacing: -0.5 },
  statLabel: { color: colors.muted, fontSize: 13, lineHeight: 16, fontWeight: '800' },
  achievementsCard: { marginTop: 14, gap: 10, backgroundColor: colors.green, borderWidth: 0 },
});
