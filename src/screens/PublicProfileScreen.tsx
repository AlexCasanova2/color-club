import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Image, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Body, Button, Card, ErrorText, Header, Screen, Title } from '@/components/ui';
import { getFriendshipWithUser, getPublicProfile, removeFriendship, respondFriendRequest, sendFriendRequest } from '@/lib/api';
import { colors } from '@/lib/theme';
import type { Friendship, PublicProfile } from '@/types/domain';

export function PublicProfileScreen({ userId, viewerUserId, onBack }: { userId: string; viewerUserId: string; onBack: () => void }) {
  const [profile, setProfile] = useState<PublicProfile | null>(null);
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
      setProfile(profileData);
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
          <View style={[styles.hero, { backgroundColor: profile.favorite_color || colors.lavender }]}>
            <View style={styles.heroWash} />
            <View style={styles.avatarWrap}>
              {profile.avatar_url ? <Image source={{ uri: profile.avatar_url }} style={styles.avatar} /> : <Text style={[styles.initial, { backgroundColor: profile.avatar_color || colors.ink }]}>{profile.display_name.charAt(0).toUpperCase()}</Text>}
            </View>
            <View style={styles.heroCopy}>
              <Text style={styles.username}>@{profile.username}</Text>
              <Text style={styles.name}>{profile.display_name}</Text>
              {profile.status_text ? <Text style={styles.status}>{profile.status_text}</Text> : null}
            </View>
          </View>

          <Card style={styles.bioCard}>
            <View style={styles.cardHeader}><Ionicons color={colors.ink} name="sparkles-outline" size={19} /><Title size="medium">Sobre {profile.display_name.split(' ')[0]}</Title></View>
            <Body muted>{profile.bio || 'Todavía no ha añadido una bio pública.'}</Body>
          </Card>

          {userId !== viewerUserId && (
            <Card style={styles.actionsCard}>
              {friendship?.status === 'accepted' ? (
                <Button label="Quitar de amigos" onPress={confirmRemoveFriend} loading={saving} variant="danger" />
              ) : friendship?.status === 'pending' && friendship.addressee_id === viewerUserId ? (
                <View style={styles.requestActions}>
                  <Button label="Aceptar solicitud" onPress={() => void respondPending(true)} loading={saving} />
                  <Button label="Ahora no" onPress={() => void respondPending(false)} disabled={saving} variant="secondary" />
                </View>
              ) : friendship?.status === 'pending' ? (
                <Button label="Solicitud enviada" onPress={() => undefined} disabled />
              ) : (
                <Button label="Enviar solicitud de amistad" onPress={() => void sendRequest()} loading={saving} />
              )}
            </Card>
          )}

          <View style={styles.detailGrid}>
            <View style={styles.detailCard}>
              <View style={[styles.colorDot, { backgroundColor: profile.favorite_color || colors.lavender }]} />
              <Text style={styles.detailLabel}>Color favorito</Text>
              <Text style={styles.detailValue}>{profile.favorite_color || 'Sin definir'}</Text>
            </View>
            <View style={styles.detailCard}>
              <Ionicons color={colors.ink} name={profile.ranking_display_name === 'username' ? 'at-outline' : 'person-outline'} size={24} />
              <Text style={styles.detailLabel}>Ranking</Text>
              <Text style={styles.detailValue}>{profile.ranking_display_name === 'username' ? '@usuario' : 'Nombre'}</Text>
            </View>
          </View>
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  loader: { marginTop: 80 },
  hero: { minHeight: 260, marginTop: 22, padding: 24, borderRadius: 34, overflow: 'hidden', justifyContent: 'flex-end' },
  heroWash: { ...StyleSheet.absoluteFillObject, backgroundColor: '#FFFFFF66' },
  avatarWrap: { width: 96, height: 96, borderRadius: 48, borderWidth: 5, borderColor: '#FFFFFFAA', overflow: 'hidden', backgroundColor: colors.ink, zIndex: 2 },
  avatar: { width: 96, height: 96, borderRadius: 48 },
  initial: { width: 96, height: 96, borderRadius: 48, color: colors.white, fontSize: 36, lineHeight: 96, textAlign: 'center', fontWeight: '900' },
  heroCopy: { marginTop: 16, zIndex: 2, gap: 4 },
  username: { color: colors.ink, fontSize: 14, fontWeight: '900', opacity: 0.68 },
  name: { color: colors.ink, fontSize: 38, lineHeight: 40, fontWeight: '900', letterSpacing: -1.1 },
  status: { alignSelf: 'flex-start', marginTop: 8, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 15, backgroundColor: colors.white, color: colors.ink, fontSize: 12, fontWeight: '900' },
  bioCard: { marginTop: 16, gap: 12, backgroundColor: colors.surface, borderColor: colors.line },
  actionsCard: { marginTop: 12, gap: 10, backgroundColor: colors.blue, borderWidth: 0 },
  requestActions: { gap: 8 },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  detailGrid: { marginTop: 14, flexDirection: 'row', gap: 10 },
  detailCard: { flex: 1, minHeight: 126, padding: 16, borderRadius: 26, backgroundColor: colors.lavender, justifyContent: 'space-between' },
  colorDot: { width: 30, height: 30, borderRadius: 12, borderWidth: 3, borderColor: '#FFFFFFAA' },
  detailLabel: { color: colors.ink, opacity: 0.62, fontSize: 11, fontWeight: '900' },
  detailValue: { color: colors.ink, fontSize: 15, fontWeight: '900' },
});
