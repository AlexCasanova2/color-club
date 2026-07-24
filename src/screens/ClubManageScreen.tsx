import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Image, Pressable, Share, StyleSheet, Switch, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { Body, Button, Card, ErrorText, Field, Header, Screen, Title } from '@/components/ui';
import { deleteClub, deleteCurrentChallenge, getClub, getClubMembers, regenerateClubInviteCode, removeClubMember, setClubMemberRole, transferClubAdmin, updateClubSettings } from '@/lib/api';
import { colors } from '@/lib/theme';
import { clubColorChoices, clubIconChoices, resolveClubIcon } from '@/lib/clubIdentity';
import type { Challenge, Club, ClubIcon, ClubMember, DurationPreset } from '@/types/domain';

const durations: Array<{ value: DurationPreset; label: string }> = [
  { value: '30min', label: '30 min' },
  { value: '2h', label: '2 horas' },
  { value: '6h', label: '6 horas' },
  { value: '24h', label: '24 horas' },
  { value: '48h', label: '48 horas' },
  { value: '1week', label: '1 semana' },
];
const photoCounts = [2, 4, 6, 8, 10, 12];
const roleLabel = { admin: 'Admin', moderator: 'Moderador', member: 'Miembro' };

export function ClubManageScreen({ clubId, userId, onBack, onDeleted, onOpenProfile }: { clubId: string; userId: string; onBack: () => void; onDeleted: () => void; onOpenProfile: (userId: string) => void }) {
  const [club, setClub] = useState<Club | null>(null);
  const [challenge, setChallenge] = useState<Challenge | null>(null);
  const [members, setMembers] = useState<ClubMember[]>([]);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [themeColor, setThemeColor] = useState(colors.lavender);
  const [clubIcon, setClubIcon] = useState<ClubIcon>('color-palette-outline');
  const [invitesEnabled, setInvitesEnabled] = useState(true);
  const [challengeCreationPolicy, setChallengeCreationPolicy] = useState<Club['challenge_creation_policy']>('admins');
  const [defaultDurationPreset, setDefaultDurationPreset] = useState<DurationPreset>('2h');
  const [defaultPhotoCount, setDefaultPhotoCount] = useState(6);
  const [chatEnabled, setChatEnabled] = useState(true);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    try {
      const [clubData, memberData] = await Promise.all([getClub(clubId), getClubMembers(clubId)]);
      setClub(clubData.club);
      setChallenge(clubData.challenge);
      setName(clubData.club.name);
      setDescription(clubData.club.description ?? '');
      setThemeColor(clubData.club.theme_color ?? colors.lavender);
      setClubIcon(resolveClubIcon(clubData.club.icon));
      setInvitesEnabled(clubData.club.invites_enabled ?? true);
      setChallengeCreationPolicy(clubData.club.challenge_creation_policy ?? 'admins');
      setDefaultDurationPreset(clubData.club.default_duration_preset ?? '2h');
      setDefaultPhotoCount(clubData.club.default_photo_count ?? 6);
      setChatEnabled(clubData.club.chat_enabled ?? true);
      setMembers(memberData);
    } catch (caught) { setError((caught as Error).message); }
    setLoading(false);
  }

  useEffect(() => { void load(); }, [clubId]);

  async function saveSettings() {
    if (name.trim().length < 2 || name.trim().length > 20 || !club) return;
    setSaving(true);
    setError(null);
    try { await updateClubSettings(club.id, { name, description, themeColor, icon: clubIcon, invitesEnabled, challengeCreationPolicy, defaultDurationPreset, defaultPhotoCount, chatEnabled }); await load(); }
    catch (caught) { setError((caught as Error).message); }
    setSaving(false);
  }

  function confirmRole(member: ClubMember) {
    const nextRole: ClubMember['role'] = member.role === 'member' ? 'moderator' : member.role === 'moderator' ? 'admin' : 'member';
    Alert.alert('Cambiar rol', `¿Quieres hacer a ${member.profiles.display_name} ${roleLabel[nextRole].toLowerCase()}?`, [
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

  function confirmTransfer(member: ClubMember) {
    Alert.alert('Transferir administración', `${member.profiles.display_name} será el admin principal del grupo.`, [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Transferir', onPress: async () => { try { await transferClubAdmin(clubId, member.user_id); await load(); } catch (caught) { setError((caught as Error).message); } } },
    ]);
  }

  async function copyInviteCode() {
    if (!club) return;
    await Clipboard.setStringAsync(club.invite_code);
  }

  async function shareInvite() {
    if (!club) return;
    await Share.share({ message: `Únete a mi grupo ${club.name} en Color Club con este código: ${club.invite_code}` });
  }

  function confirmRegenerateCode() {
    Alert.alert('Regenerar código', 'El código actual dejará de servir para nuevas invitaciones.', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Regenerar', onPress: async () => { try { await regenerateClubInviteCode(clubId); await load(); } catch (caught) { setError((caught as Error).message); } } },
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
        <View style={[styles.heroIcon, { backgroundColor: themeColor }]}><Ionicons color={colors.ink} name={clubIcon} size={26} /></View>
        <Title>Grupo</Title>
        <Body>Configura el club, miembros y reto actual.</Body>
      </View>
      <ErrorText message={error} />

      <Text style={styles.sectionTitle}>Información</Text>
      <Card style={styles.nameCard}>
        <Field label="Nombre del grupo" value={name} onChangeText={setName} maxLength={20} />
        <Text style={styles.nameCounter}>{name.length} / 20</Text>
        <Field label="Descripción" value={description} onChangeText={setDescription} multiline numberOfLines={3} inputStyle={styles.textArea} />
        <Text style={styles.smallLabel}>Color del grupo</Text>
        <View style={styles.palette}>{clubColorChoices.map((choice) => <Pressable key={choice.hex} accessibilityLabel={choice.name} onPress={() => setThemeColor(choice.hex)} style={[styles.colorDot, { backgroundColor: choice.hex }, themeColor === choice.hex && styles.colorDotSelected]} />)}</View>
        <Text style={styles.smallLabel}>Icono del grupo</Text>
        <View style={styles.palette}>{clubIconChoices.map((choice) => <Pressable key={choice.value} accessibilityLabel={choice.name} onPress={() => setClubIcon(choice.value)} style={[styles.iconChoice, clubIcon === choice.value && { backgroundColor: themeColor, borderColor: colors.ink }]}><Ionicons color={colors.ink} name={choice.value} size={21} /></Pressable>)}</View>
        <Button label="Guardar cambios" onPress={saveSettings} loading={saving} disabled={name.trim().length < 2 || name.trim().length > 20} />
      </Card>

      <Text style={styles.sectionTitle}>Invitaciones</Text>
      <Card style={styles.inviteCard}>
        <View style={styles.settingRow}><View style={styles.settingCopy}><Text style={styles.settingTitle}>Permitir nuevas invitaciones</Text><Text style={styles.settingDescription}>Activa o pausa el acceso por código.</Text></View><Switch value={invitesEnabled} onValueChange={setInvitesEnabled} trackColor={{ false: '#D6D4CD', true: colors.ink }} /></View>
        <View style={styles.inviteCodeRow}><View><Text style={styles.inviteLabel}>Código actual</Text><Text style={styles.inviteCode}>{club.invite_code}</Text></View><Pressable onPress={copyInviteCode} style={({ pressed }) => [styles.iconButton, pressed && styles.pressed]}><Ionicons color={colors.ink} name="copy-outline" size={19} /></Pressable><Pressable onPress={shareInvite} style={({ pressed }) => [styles.iconButton, pressed && styles.pressed]}><Ionicons color={colors.ink} name="share-outline" size={19} /></Pressable></View>
        <Button label="Regenerar código" onPress={confirmRegenerateCode} variant="secondary" />
      </Card>

      <Text style={styles.sectionTitle}>Reglas por defecto</Text>
      <Card style={styles.rulesCard}>
        <Text style={styles.smallLabel}>Quién puede crear retos</Text>
        <View style={styles.segmentList}>
          {[{ value: 'admins', label: 'Admins' }, { value: 'admins_moderators', label: 'Admins + mods' }, { value: 'all_members', label: 'Todos' }].map((item) => <Pressable key={item.value} onPress={() => setChallengeCreationPolicy(item.value as Club['challenge_creation_policy'])} style={[styles.segment, challengeCreationPolicy === item.value && styles.segmentSelected]}><Text style={[styles.segmentText, challengeCreationPolicy === item.value && styles.segmentTextSelected]}>{item.label}</Text></Pressable>)}
        </View>
        <Text style={styles.smallLabel}>Fotos por defecto</Text>
        <View style={styles.segmentList}>{photoCounts.map((count) => <Pressable key={count} onPress={() => setDefaultPhotoCount(count)} style={[styles.countSegment, defaultPhotoCount === count && styles.segmentSelected]}><Text style={[styles.segmentText, defaultPhotoCount === count && styles.segmentTextSelected]}>{count}</Text></Pressable>)}</View>
        <Text style={styles.smallLabel}>Duración por defecto</Text>
        <View style={styles.segmentList}>{durations.map((item) => <Pressable key={item.value} onPress={() => setDefaultDurationPreset(item.value)} style={[styles.segment, defaultDurationPreset === item.value && styles.segmentSelected]}><Text style={[styles.segmentText, defaultDurationPreset === item.value && styles.segmentTextSelected]}>{item.label}</Text></Pressable>)}</View>
        <View style={styles.settingRow}><View style={styles.settingCopy}><Text style={styles.settingTitle}>Chat del grupo</Text><Text style={styles.settingDescription}>Mantener conversación activa para este club.</Text></View><Switch value={chatEnabled} onValueChange={setChatEnabled} trackColor={{ false: '#D6D4CD', true: colors.ink }} /></View>
        <Button label="Guardar reglas" onPress={saveSettings} loading={saving} disabled={name.trim().length < 2 || name.trim().length > 20} />
      </Card>

      <Text style={styles.sectionTitle}>Usuarios del club</Text>
      <View style={styles.membersList}>
        {members.map((member) => (
          <View key={member.id} style={styles.memberRow}>
            <Pressable onPress={() => onOpenProfile(member.user_id)} style={({ pressed }) => [styles.memberIdentity, pressed && styles.pressed]}>
              <View style={styles.avatar}>{member.profiles.avatar_url ? <Image source={{ uri: member.profiles.avatar_url }} style={styles.avatarImage} /> : <Text style={[styles.initial, { backgroundColor: member.profiles.avatar_color ?? colors.ink }]}>{member.profiles.display_name.charAt(0).toUpperCase()}</Text>}</View>
              <View style={styles.memberCopy}>
                <Text style={styles.memberName}>{member.profiles.display_name}{member.user_id === userId ? ' (tú)' : ''}</Text>
                <Text style={styles.memberMeta}>@{member.profiles.username} · {roleLabel[member.role]}</Text>
              </View>
            </Pressable>
            <Pressable onPress={() => confirmRole(member)} style={({ pressed }) => [styles.iconButton, pressed && styles.pressed]}>
              <Ionicons color={colors.ink} name={member.role === 'admin' ? 'shield-checkmark' : 'shield-outline'} size={20} />
            </Pressable>
            {member.user_id !== userId && <Pressable onPress={() => confirmTransfer(member)} style={({ pressed }) => [styles.iconButton, styles.transferIconButton, pressed && styles.pressed]}><Ionicons color={colors.ink} name="key-outline" size={18} /></Pressable>}
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
  heroIcon: { width: 52, height: 52, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  sectionTitle: { color: colors.ink, fontSize: 21, fontWeight: '900', marginTop: 28, marginBottom: 10 },
  nameCard: { gap: 14, backgroundColor: colors.blue, borderWidth: 0 },
  textArea: { minHeight: 92, paddingTop: 14, textAlignVertical: 'top' },
  smallLabel: { color: colors.muted, fontSize: 13, fontWeight: '700' },
  palette: { flexDirection: 'row', flexWrap: 'wrap', gap: 9 },
  colorDot: { width: 38, height: 38, borderRadius: 14, borderWidth: 3, borderColor: '#FFFFFFAA' },
  nameCounter: { alignSelf: 'flex-end', color: colors.muted, fontSize: 11, fontWeight: '700', marginTop: -7 },
  colorDotSelected: { borderColor: colors.ink, transform: [{ scale: 1.08 }] },
  iconChoice: { width: 44, height: 44, borderRadius: 15, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
  inviteCard: { gap: 14, backgroundColor: colors.green, borderWidth: 0 },
  settingRow: { minHeight: 64, flexDirection: 'row', alignItems: 'center', gap: 12 },
  settingCopy: { flex: 1, gap: 3 },
  settingTitle: { color: colors.ink, fontSize: 15, fontWeight: '900' },
  settingDescription: { color: colors.ink, opacity: 0.64, fontSize: 12, lineHeight: 16 },
  inviteCodeRow: { minHeight: 70, paddingHorizontal: 14, borderRadius: 22, backgroundColor: '#FFFFFF88', flexDirection: 'row', alignItems: 'center', gap: 10 },
  inviteLabel: { color: colors.ink, opacity: 0.6, fontSize: 11, fontWeight: '800', marginBottom: 3 },
  inviteCode: { color: colors.ink, fontSize: 18, fontWeight: '900', letterSpacing: 1 },
  rulesCard: { gap: 14, backgroundColor: colors.lavender, borderWidth: 0 },
  segmentList: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  segment: { minHeight: 42, minWidth: '30%', flexGrow: 1, paddingHorizontal: 12, borderRadius: 16, backgroundColor: '#FFFFFF88', alignItems: 'center', justifyContent: 'center' },
  countSegment: { width: 46, height: 42, borderRadius: 16, backgroundColor: '#FFFFFF88', alignItems: 'center', justifyContent: 'center' },
  segmentSelected: { backgroundColor: colors.ink },
  segmentText: { color: colors.ink, fontSize: 12, fontWeight: '800' },
  segmentTextSelected: { color: colors.white },
  membersList: { gap: 10 },
  memberRow: { minHeight: 82, paddingHorizontal: 14, borderRadius: 24, backgroundColor: colors.surface, flexDirection: 'row', alignItems: 'center', gap: 10 },
  memberIdentity: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10 },
  avatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.ink, alignItems: 'center', justifyContent: 'center' },
  avatarImage: { width: 44, height: 44, borderRadius: 22 },
  initial: { width: 42, height: 42, borderRadius: 21, overflow: 'hidden', color: colors.white, fontSize: 16, lineHeight: 42, textAlign: 'center', fontWeight: '900' },
  memberCopy: { flex: 1 },
  memberName: { color: colors.ink, fontSize: 15, fontWeight: '800' },
  memberMeta: { color: colors.muted, fontSize: 11, marginTop: 3 },
  iconButton: { width: 42, height: 42, borderRadius: 15, backgroundColor: colors.blue, alignItems: 'center', justifyContent: 'center' },
  transferIconButton: { backgroundColor: colors.green },
  dangerIconButton: { backgroundColor: '#FCE8E6' },
  pressed: { opacity: 0.65 },
  dangerCard: { gap: 14, backgroundColor: colors.orange, borderWidth: 0 },
  dangerCopy: { gap: 4 },
  dangerTitle: { color: colors.ink, fontSize: 17, fontWeight: '900' },
  deleteClubCard: { gap: 14 },
  deleteTitle: { color: colors.danger, fontSize: 19, fontWeight: '900' },
});
