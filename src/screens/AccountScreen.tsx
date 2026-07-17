import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { Body, Button, Card, ErrorText, Eyebrow, Header, Screen, Title } from '@/components/ui';
import { supabase } from '@/lib/supabase';
import { colors } from '@/lib/theme';
import type { Profile } from '@/types/domain';

export function AccountScreen({ userId, email }: { userId: string; email: string }) {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void supabase.from('profiles').select('*').eq('id', userId).single().then(({ data, error: profileError }) => {
      if (profileError) setError(profileError.message);
      else setProfile(data as Profile);
    });
  }, [userId]);

  return (
    <Screen>
      <Header title="Color Club" />
      <View style={styles.heading}><Eyebrow>Perfil</Eyebrow><Title>Cuenta</Title></View>
      <ErrorText message={error} />
      {!profile && !error ? <ActivityIndicator style={styles.loader} color={colors.coral} /> : profile && (
        <Card style={styles.profile}>
          <View style={styles.avatar}><Text style={styles.initial}>{profile.display_name.charAt(0).toUpperCase()}</Text></View>
          <View style={styles.identity}><Text style={styles.name}>{profile.display_name}</Text><Body muted>{email}</Body></View>
        </Card>
      )}
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
  section: { marginTop: 34, paddingTop: 20, borderTopWidth: 1, borderTopColor: colors.line, gap: 14 },
  sectionLabel: { color: colors.ink, fontSize: 15, fontWeight: '600' },
});
