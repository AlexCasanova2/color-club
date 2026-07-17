import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { Body, Button, Card, ErrorText, Eyebrow, Field, Header, Screen, Title } from '@/components/ui';
import { supabase } from '@/lib/supabase';
import { colors } from '@/lib/theme';
import type { Profile } from '@/types/domain';

export function AccountScreen({ userId, email }: { userId: string; email: string }) {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [username, setUsername] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    void supabase.from('profiles').select('*').eq('id', userId).single().then(({ data, error: profileError }) => {
      if (profileError) setError(profileError.message);
      else { setProfile(data as Profile); setUsername(data.username as string); }
    });
  }, [userId]);

  async function saveUsername() {
    const normalized = username.trim().toLowerCase().replace(/^@/, '');
    if (!/^[a-z0-9_]{3,32}$/.test(normalized)) {
      setError('Usa entre 3 y 32 caracteres: letras minúsculas, números o guion bajo.');
      return;
    }
    setSaving(true);
    setError(null);
    setMessage(null);
    const { data, error: updateError } = await supabase.from('profiles').update({ username: normalized }).eq('id', userId).select('*').single();
    if (updateError) setError(updateError.code === '23505' ? 'Ese nombre de usuario ya está ocupado.' : updateError.message);
    else { setProfile(data as Profile); setUsername(normalized); setMessage('Nombre de usuario actualizado.'); }
    setSaving(false);
  }

  return (
    <Screen>
      <Header title="Color Club" />
      <View style={styles.heading}><Eyebrow>Perfil</Eyebrow><Title>Cuenta</Title></View>
      <ErrorText message={error} />
      {!profile && !error ? <ActivityIndicator style={styles.loader} color={colors.coral} /> : profile && (
        <Card style={styles.profile}>
          <View style={styles.avatar}><Text style={styles.initial}>{profile.display_name.charAt(0).toUpperCase()}</Text></View>
          <View style={styles.identity}><Text style={styles.name}>{profile.display_name}</Text><Text style={styles.username}>@{profile.username}</Text><Body muted>{email}</Body></View>
        </Card>
      )}
      {profile && (
        <>
          <Card style={styles.usernameCard}>
            <Field label="Nombre de usuario público" value={username} onChangeText={setUsername} autoCapitalize="none" autoCorrect={false} returnKeyType="done" onSubmitEditing={saveUsername} />
            <Button label="Guardar nombre" onPress={saveUsername} loading={saving} disabled={username === profile.username} variant="secondary" />
          </Card>
          <View style={styles.publicCode}>
            <View style={styles.codeText}><Text style={styles.sectionLabel}>Tu código público</Text><Body muted>Compártelo para que puedan encontrarte.</Body></View>
            <Text selectable style={styles.code}>{profile.friend_code}</Text>
          </View>
        </>
      )}
      {message && <Text style={styles.message}>{message}</Text>}
      <View style={styles.section}>
        <Text style={styles.sectionLabel}>Sesión</Text>
        <Body muted>Tu cuenta se mantiene sincronizada de forma segura con Supabase.</Body>
        <Button label="Cerrar sesión" onPress={() => void supabase.auth.signOut()} variant="danger" />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  heading: { marginVertical: 26, gap: 8 },
  loader: { marginTop: 60 },
  profile: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  avatar: { width: 54, height: 54, borderRadius: 27, backgroundColor: colors.ink, alignItems: 'center', justifyContent: 'center' },
  initial: { color: colors.white, fontSize: 20, fontWeight: '600' },
  identity: { flex: 1, gap: 3 },
  name: { color: colors.ink, fontSize: 19, fontWeight: '600' },
  username: { color: colors.coral, fontSize: 13, fontWeight: '600' },
  usernameCard: { marginTop: 14, gap: 14 },
  publicCode: { marginTop: 14, padding: 18, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, borderRadius: 16, flexDirection: 'row', alignItems: 'center', gap: 12 },
  codeText: { flex: 1, gap: 3 },
  code: { color: colors.ink, fontSize: 13, fontWeight: '700', letterSpacing: 0.6 },
  message: { color: colors.green, fontSize: 13, marginTop: 10 },
  section: { marginTop: 34, paddingTop: 20, borderTopWidth: 1, borderTopColor: colors.line, gap: 14 },
  sectionLabel: { color: colors.ink, fontSize: 15, fontWeight: '600' },
});
