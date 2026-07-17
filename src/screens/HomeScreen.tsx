import { useEffect, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, StyleSheet, Switch, Text, View } from 'react-native';
import { Body, Button, Card, ErrorText, Eyebrow, Field, Header, Screen, Title } from '@/components/ui';
import { createClub, getClubs, joinClub } from '@/lib/api';
import { supabase } from '@/lib/supabase';
import { colors } from '@/lib/theme';
import type { Club } from '@/types/domain';

export function HomeScreen({ onOpenClub }: { onOpenClub: (id: string) => void }) {
  const [clubs, setClubs] = useState<Club[]>([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState<'create' | 'join' | null>(null);
  const [value, setValue] = useState('');
  const [monthly, setMonthly] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    try { setClubs(await getClubs()); } catch (caught) { setError((caught as Error).message); }
    setLoading(false);
  }

  useEffect(() => { void load(); }, []);

  function open(kind: 'create' | 'join') {
    setValue('');
    setError(null);
    setModal(kind);
  }

  async function save() {
    if (!value.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const id = modal === 'create' ? await createClub(value.trim(), monthly) : await joinClub(value.trim());
      setModal(null);
      await load();
      onOpenClub(id);
    } catch (caught) { setError((caught as Error).message); }
    setSaving(false);
  }

  return (
    <Screen>
      <Header title="COLOR CLUB" action={<Pressable onPress={() => supabase.auth.signOut()}><Text style={styles.signOut}>Salir</Text></Pressable>} />
      <View style={styles.hero}>
        <Eyebrow>Tu mesa de juego</Eyebrow>
        <Title>Mis clubs</Title>
      </View>
      <View style={styles.actions}>
        <Button label="+ Crear club" onPress={() => open('create')} />
        <Button label="Tengo un código" onPress={() => open('join')} variant="secondary" />
      </View>
      <ErrorText message={!modal ? error : null} />
      {loading ? <ActivityIndicator style={styles.loader} color={colors.coral} /> : clubs.length === 0 ? (
        <Card style={styles.empty}>
          <Text style={styles.emptyNumber}>00</Text>
          <Title size="medium">Todavía no hay club</Title>
          <Body muted>Crea uno e invita a tus amigos. El juego empieza cuando dejáis de mirar el móvil y empezáis a mirar colores.</Body>
        </Card>
      ) : (
        <View style={styles.list}>
          {clubs.map((club, index) => (
            <Pressable key={club.id} onPress={() => onOpenClub(club.id)} style={({ pressed }) => [styles.club, pressed && styles.pressed]}>
              <Text style={styles.clubIndex}>{String(index + 1).padStart(2, '0')}</Text>
              <View style={styles.clubText}>
                <Text style={styles.clubName}>{club.name}</Text>
                <Text style={styles.clubCode}>Código {club.invite_code}</Text>
              </View>
              <Text style={styles.arrow}>→</Text>
            </Pressable>
          ))}
        </View>
      )}
      <Modal animationType="slide" transparent visible={modal !== null} onRequestClose={() => setModal(null)}>
        <Pressable style={styles.scrim} onPress={() => setModal(null)} />
        <View style={styles.sheet}>
          <Eyebrow>{modal === 'create' ? 'Nuevo espacio' : 'Tu invitación'}</Eyebrow>
          <Title size="medium">{modal === 'create' ? 'Ponle nombre al club' : 'Entra en el club'}</Title>
          <Field
            label={modal === 'create' ? 'Nombre' : 'Código de 8 caracteres'}
            value={value}
            onChangeText={setValue}
            autoCapitalize={modal === 'join' ? 'characters' : 'words'}
          />
          {modal === 'create' && (
            <View style={styles.switchRow}>
              <View style={styles.switchText}><Text style={styles.switchTitle}>Temporada mensual</Text><Body muted>El marcador se reinicia cada mes.</Body></View>
              <Switch value={monthly} onValueChange={setMonthly} trackColor={{ true: colors.coral }} />
            </View>
          )}
          <ErrorText message={error} />
          <Button label={modal === 'create' ? 'Crear club' : 'Unirme'} onPress={save} loading={saving} disabled={!value.trim()} />
          <Button label="Cancelar" onPress={() => setModal(null)} variant="quiet" />
        </View>
      </Modal>
    </Screen>
  );
}

const styles = StyleSheet.create({
  signOut: { color: colors.muted, fontWeight: '700' },
  hero: { marginTop: 22, marginBottom: 26 },
  actions: { gap: 10, marginBottom: 26 },
  loader: { marginTop: 70 },
  empty: { gap: 14, paddingVertical: 28 },
  emptyNumber: { color: colors.line, fontSize: 54, fontWeight: '900' },
  list: { borderTopWidth: 1, borderTopColor: colors.line },
  club: { minHeight: 86, borderBottomWidth: 1, borderBottomColor: colors.line, flexDirection: 'row', alignItems: 'center', gap: 14 },
  pressed: { opacity: 0.6 },
  clubIndex: { color: colors.coral, fontWeight: '900', fontSize: 13 },
  clubText: { flex: 1 },
  clubName: { color: colors.ink, fontSize: 22, fontWeight: '900' },
  clubCode: { color: colors.muted, marginTop: 3, fontSize: 12 },
  arrow: { color: colors.ink, fontSize: 24 },
  scrim: { flex: 1, backgroundColor: '#00000044' },
  sheet: { backgroundColor: colors.paper, padding: 24, paddingBottom: 34, gap: 18, borderTopWidth: 1, borderColor: colors.ink },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: 15 },
  switchText: { flex: 1 },
  switchTitle: { color: colors.ink, fontWeight: '800', fontSize: 16 },
});
