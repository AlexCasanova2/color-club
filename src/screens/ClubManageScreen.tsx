import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Body, Button, Card, ErrorText, Field, Header, Screen, Title } from '@/components/ui';
import { deleteClub, deleteCurrentChallenge, getClub, getClubMembers, removeClubMember, setClubMemberRole, updateClubName } from '@/lib/api';
import { colors } from '@/lib/theme';
import type { Challenge, Club, ClubMember } from '@/types/domain';

export function ClubManageScreen({ clubId, userId, onBack, onDeleted }: { clubId: string; userId: string; onBack: () => void; onDeleted: () => void }) {
  const [club, setClub] = useState<Club | null>(null);
  const [challenge, setChallenge] = useState<Challenge | null>(null);
  const [members, setMembers] = useState<ClubMember[]>([]);
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    try {
      const [clubData, memberData] = await Promise.all([getClub(clubId), getClubMembers(clubId)]);
      setClub(clubData.club);
      setChallenge(clubData.challenge);
      setName(clubData.club.name);
      setMembers(memberData);
    } catch (caught) { setError((caught as Error).message); }
    setLoading(false);
  }

  useEffect(() => { void load(); }, [clubId]);

  async function saveName() {
    if (!name.trim() || !club) return;
    setSaving(true);
    setError(null);
    try { await updateClubName(club.id, name); await load(); }
    catch (caught) { setError((caught as Error).message); }
    setSaving(false);
  }

  function confirmRole(member: ClubMember) {
    const nextRole = member.role === 'admin' ? 'member' : 'admin';
    Alert.alert('Cambiar rol', `¿Quieres hacer a ${member.profiles.display_name} ${nextRole === 'admin' ? 'admin' : 'miembro'}?`, [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Cambiar', onPress: async () => { try { await setClubMemberRole(member.id, nextRole); await load(); } catch (caught) { setError((caught as Error).message); } } },
    ]);
  }

  function confirmRemove(member: ClubMember) {
    Alert.alert('Eliminar usuario', `¿Eliminar a ${member.profiles.display_name} del club?`, [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Eliminar', style: 'destructive', onPress: async () => { try { await removeClubMember(member.id); await load(); } catch (caught) { setError((caught as Error).message); } } },
    ]);
  }

  function confirmDeleteChallenge() {
    Alert.alert('Borrar reto actual', 'Se eliminará el reto en curso o programado y sus collages. Esta acción no se puede deshacer.', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Borrar reto', style: 'destructive', onPress: async () => { try { await deleteCurrentChallenge(clubId); await load(); } catch (caught) { setError((caught as Error).message); } } },
    ]);
  }

  function confirmDeleteClub() {
    Alert.prompt('Borrar grupo', 'Escribe BORRAR para eliminar el grupo permanentemente.', async (text) => {
      try { await deleteClub(clubId, text); onDeleted(); }
      catch (caught) { setError((caught as Error).message); }
    }, 'plain-text');
  }

  if (loading || !club) return <Screen stickyHeader bottomInset={28}><Header title="Administrar" onBack={onBack} /><ActivityIndicator style={styles.loader} color={colors.coral} /></Screen>;

  return (
    <Screen stickyHeader bottomInset={28}>
      <Header title="Administrar" onBack={onBack} />
      <View style={styles.hero}>
        <View style={styles.heroIcon}><Ionicons color={colors.ink} name="settings-outline" size={26} /></View>
        <Title>Grupo</Title>
        <Body>Configura el club, miembros y reto actual.</Body>
      </View>
      <ErrorText message={error} />

      <Text style={styles.sectionTitle}>Información</Text>
      <Card style={styles.nameCard}>
        <Field label="Nombre del grupo" value={name} onChangeText={setName} />
        <Button label="Guardar nombre" onPress={saveName} loading={saving} disabled={name.trim() === club.name} />
      </Card>

      <Text style={styles.sectionTitle}>Usuarios del club</Text>
      <View style={styles.membersList}>
        {members.map((member) => (
          <View key={member.id} style={styles.memberRow}>
            <View style={styles.avatar}><Text style={[styles.initial, { backgroundColor: member.profiles.avatar_color ?? colors.ink }]}>{member.profiles.display_name.charAt(0).toUpperCase()}</Text></View>
            <View style={styles.memberCopy}>
              <Text style={styles.memberName}>{member.profiles.display_name}{member.user_id === userId ? ' (tú)' : ''}</Text>
              <Text style={styles.memberMeta}>@{member.profiles.username} · {member.role === 'admin' ? 'Admin' : 'Miembro'}</Text>
            </View>
            <Pressable onPress={() => confirmRole(member)} style={({ pressed }) => [styles.iconButton, pressed && styles.pressed]}>
              <Ionicons color={colors.ink} name={member.role === 'admin' ? 'shield-checkmark' : 'shield-outline'} size={20} />
            </Pressable>
            {member.user_id !== userId && (
              <Pressable onPress={() => confirmRemove(member)} style={({ pressed }) => [styles.iconButton, styles.dangerIconButton, pressed && styles.pressed]}>
                <Ionicons color={colors.danger} name="trash-outline" size={19} />
              </Pressable>
            )}
          </View>
        ))}
      </View>

      <Text style={styles.sectionTitle}>Reto actual</Text>
      <Card style={styles.dangerCard}>
        <View style={styles.dangerCopy}><Text style={styles.dangerTitle}>{challenge && challenge.status !== 'closed' ? 'Hay un reto activo o programado' : 'No hay reto activo'}</Text><Body muted>Elimina el reto actual si necesitas reiniciar el flujo.</Body></View>
        <Button label="Borrar reto actual" onPress={confirmDeleteChallenge} disabled={!challenge || challenge.status === 'closed'} variant="danger" />
      </Card>

      <Text style={styles.sectionTitle}>Zona peligrosa</Text>
      <Card style={styles.deleteClubCard}>
        <Text style={styles.deleteTitle}>Borrar grupo</Text>
        <Body muted>Eliminará miembros, retos, collages, votos y temporadas del club.</Body>
        <Button label="Borrar grupo" onPress={confirmDeleteClub} variant="danger" />
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  loader: { marginTop: 100 },
  hero: { minHeight: 190, marginTop: 22, padding: 24, borderRadius: 30, backgroundColor: colors.pink, justifyContent: 'flex-end', gap: 8 },
  heroIcon: { width: 52, height: 52, borderRadius: 19, backgroundColor: '#FFFFFF88', alignItems: 'center', justifyContent: 'center' },
  sectionTitle: { color: colors.ink, fontSize: 21, fontWeight: '900', marginTop: 28, marginBottom: 10 },
  nameCard: { gap: 14, backgroundColor: colors.blue, borderWidth: 0 },
  membersList: { gap: 10 },
  memberRow: { minHeight: 82, paddingHorizontal: 14, borderRadius: 24, backgroundColor: colors.surface, flexDirection: 'row', alignItems: 'center', gap: 10 },
  avatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.ink, alignItems: 'center', justifyContent: 'center' },
  initial: { width: 42, height: 42, borderRadius: 21, overflow: 'hidden', color: colors.white, fontSize: 16, lineHeight: 42, textAlign: 'center', fontWeight: '900' },
  memberCopy: { flex: 1 },
  memberName: { color: colors.ink, fontSize: 15, fontWeight: '800' },
  memberMeta: { color: colors.muted, fontSize: 11, marginTop: 3 },
  iconButton: { width: 42, height: 42, borderRadius: 15, backgroundColor: colors.blue, alignItems: 'center', justifyContent: 'center' },
  dangerIconButton: { backgroundColor: '#FCE8E6' },
  pressed: { opacity: 0.65 },
  dangerCard: { gap: 14, backgroundColor: colors.orange, borderWidth: 0 },
  dangerCopy: { gap: 4 },
  dangerTitle: { color: colors.ink, fontSize: 17, fontWeight: '900' },
  deleteClubCard: { gap: 14 },
  deleteTitle: { color: colors.danger, fontSize: 19, fontWeight: '900' },
});
