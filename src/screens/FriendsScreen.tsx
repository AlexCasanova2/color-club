import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Keyboard, Pressable, StyleSheet, Text, View } from 'react-native';
import { Body, Button, Card, ErrorText, Eyebrow, Field, Header, Screen, Title } from '@/components/ui';
import { getFriendships, removeFriendship, respondFriendRequest, sendFriendRequest } from '@/lib/api';
import { colors } from '@/lib/theme';
import type { Friendship, Profile } from '@/types/domain';

function Identity({ profile }: { profile: Profile }) {
  return (
    <>
      <View style={styles.avatar}><Text style={styles.initial}>{profile.display_name.charAt(0).toUpperCase()}</Text></View>
      <View style={styles.identity}>
        <Text style={styles.name}>{profile.display_name}</Text>
        <Text style={styles.username}>@{profile.username}</Text>
      </View>
    </>
  );
}

export function FriendsScreen({ userId }: { userId: string }) {
  const [relationships, setRelationships] = useState<Friendship[]>([]);
  const [identifier, setIdentifier] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function load() {
    try { setRelationships(await getFriendships()); setError(null); }
    catch (caught) { setError((caught as Error).message); }
    setLoading(false);
  }

  useEffect(() => { void load(); }, []);

  async function send() {
    if (!identifier.trim()) return;
    setSaving(true);
    setError(null);
    setMessage(null);
    Keyboard.dismiss();
    try {
      await sendFriendRequest(identifier);
      setIdentifier('');
      setMessage('Solicitud enviada.');
      await load();
    } catch (caught) { setError((caught as Error).message); }
    setSaving(false);
  }

  async function respond(id: string, accept: boolean) {
    try { await respondFriendRequest(id, accept); await load(); }
    catch (caught) { setError((caught as Error).message); }
  }

  function remove(friendship: Friendship, profile: Profile) {
    Alert.alert('Eliminar amistad', `¿Quieres eliminar a ${profile.display_name} de tus amigos?`, [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Eliminar', style: 'destructive', onPress: async () => {
        try { await removeFriendship(friendship.id); await load(); }
        catch (caught) { setError((caught as Error).message); }
      } },
    ]);
  }

  const friends = relationships.filter((item) => item.status === 'accepted');
  const received = relationships.filter((item) => item.status === 'pending' && item.addressee_id === userId);
  const sent = relationships.filter((item) => item.status === 'pending' && item.requester_id === userId);

  return (
    <Screen>
      <Header title="Color Club" />
      <View style={styles.heading}><Eyebrow>Tu gente</Eyebrow><Title>Amigos</Title><Body muted>Añade a alguien usando su nombre exacto o su código público.</Body></View>
      <Card style={styles.searchCard}>
        <Field
          label="Usuario o código"
          value={identifier}
          onChangeText={setIdentifier}
          onSubmitEditing={send}
          placeholder="@usuario o CC-A1B2C3D4E5F6"
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="send"
        />
        <Button label="Enviar solicitud" onPress={send} loading={saving} disabled={!identifier.trim()} />
      </Card>
      <ErrorText message={error} />
      {message && <Text style={styles.message}>{message}</Text>}
      {loading ? <ActivityIndicator style={styles.loader} color={colors.coral} /> : (
        <>
          {received.length > 0 && <Text style={styles.sectionTitle}>Solicitudes</Text>}
          <View style={styles.list}>
            {received.map((item) => (
              <Card key={item.id} style={styles.personCard}>
                <View style={styles.person}><Identity profile={item.requester} /></View>
                <View style={styles.requestActions}>
                  <Pressable onPress={() => void respond(item.id, true)} style={[styles.smallButton, styles.acceptButton]}><Text style={styles.acceptText}>Aceptar</Text></Pressable>
                  <Pressable onPress={() => void respond(item.id, false)} style={styles.smallButton}><Text style={styles.smallButtonText}>Ahora no</Text></Pressable>
                </View>
              </Card>
            ))}
          </View>
          <Text style={styles.sectionTitle}>Tus amigos · {friends.length}</Text>
          {friends.length === 0 ? <Card style={styles.empty}><Body muted>Aún no tienes amigos añadidos. Comparte tu código desde Cuenta o busca el suyo aquí.</Body></Card> : (
            <View style={styles.list}>
              {friends.map((item) => {
                const profile = item.requester_id === userId ? item.addressee : item.requester;
                return (
                  <Pressable key={item.id} onLongPress={() => remove(item, profile)} style={({ pressed }) => [styles.friend, pressed && styles.pressed]}>
                    <Identity profile={profile} />
                    <Text style={styles.code}>{profile.friend_code}</Text>
                  </Pressable>
                );
              })}
            </View>
          )}
          {sent.length > 0 && <Text style={styles.sectionTitle}>Pendientes</Text>}
          <View style={styles.list}>
            {sent.map((item) => (
              <View key={item.id} style={styles.friend}>
                <Identity profile={item.addressee} />
                <Text style={styles.pending}>Enviada</Text>
              </View>
            ))}
          </View>
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  heading: { marginVertical: 26, gap: 8 },
  searchCard: { gap: 14 },
  message: { color: colors.green, fontSize: 13, marginTop: 12 },
  loader: { marginTop: 60 },
  sectionTitle: { color: colors.muted, fontSize: 13, fontWeight: '600', marginTop: 30, marginBottom: 10 },
  list: { gap: 10 },
  personCard: { gap: 16 },
  person: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  friend: { minHeight: 74, paddingHorizontal: 15, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, borderRadius: 16, flexDirection: 'row', alignItems: 'center', gap: 12 },
  pressed: { opacity: 0.65 },
  avatar: { width: 42, height: 42, borderRadius: 21, backgroundColor: colors.ink, alignItems: 'center', justifyContent: 'center' },
  initial: { color: colors.white, fontSize: 16, fontWeight: '600' },
  identity: { flex: 1, gap: 2 },
  name: { color: colors.ink, fontSize: 16, fontWeight: '600' },
  username: { color: colors.muted, fontSize: 12 },
  code: { color: colors.muted, fontSize: 9, fontWeight: '600' },
  pending: { color: colors.coral, fontSize: 11, fontWeight: '600' },
  requestActions: { flexDirection: 'row', gap: 8 },
  smallButton: { flex: 1, minHeight: 42, borderWidth: 1, borderColor: colors.line, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  acceptButton: { backgroundColor: colors.ink, borderColor: colors.ink },
  smallButtonText: { color: colors.ink, fontSize: 13, fontWeight: '600' },
  acceptText: { color: colors.white, fontSize: 13, fontWeight: '600' },
  empty: { marginBottom: 4 },
});
