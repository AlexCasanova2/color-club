import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Animated, Image, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { ToastBubble, ToastOverlay } from '@/components/Toast';
import { Body, Button, Card, ErrorText, Field, Header, Screen, Title } from '@/components/ui';
import { advanceChallenge, getClub, getClubMembers, getFriendships, getMyClubMembership, inviteUserToClub } from '@/lib/api';
import { supabase } from '@/lib/supabase';
import { colors } from '@/lib/theme';
import type { Challenge, Club, ClubMember, Friendship, Participant, Profile, RankingRow } from '@/types/domain';

function countdown(date: string) {
  const milliseconds = Math.max(0, new Date(date).getTime() - Date.now());
  const hours = Math.floor(milliseconds / 3_600_000);
  const minutes = Math.floor((milliseconds % 3_600_000) / 60_000);
  const seconds = Math.floor((milliseconds % 60_000) / 1000);
  return `${hours}h ${String(minutes).padStart(2, '0')}m ${String(seconds).padStart(2, '0')}s`;
}

const statusLabel = { configuring: 'Programado', active: 'En juego', voting: 'Votación', closed: 'Resultados' };

export function ClubScreen({ clubId, userId, onBack, onChallenge, onNewChallenge, onManage, onChat }: {
  clubId: string;
  userId: string;
  onBack: () => void;
  onChallenge: (id: string) => void;
  onNewChallenge: () => void;
  onManage: () => void;
  onChat: () => void;
}) {
  const [club, setClub] = useState<Club | null>(null);
  const [challenge, setChallenge] = useState<Challenge | null>(null);
  const [myChallengeColor, setMyChallengeColor] = useState<string | null>(null);
  const [myChallengeStatus, setMyChallengeStatus] = useState<Participant['status'] | null>(null);
  const [isChallengeParticipant, setIsChallengeParticipant] = useState(false);
  const [submittedCount, setSubmittedCount] = useState(0);
  const [participantCount, setParticipantCount] = useState(0);
  const [ranking, setRanking] = useState<RankingRow[]>([]);
  const [friends, setFriends] = useState<Profile[]>([]);
  const [membership, setMembership] = useState<ClubMember | null>(null);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [identifier, setIdentifier] = useState('');
  const [loading, setLoading] = useState(true);
  const [inviting, setInviting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [toastKey, setToastKey] = useState(0);
  const [invitedFriendIds, setInvitedFriendIds] = useState<string[]>([]);
  const [memberUserIds, setMemberUserIds] = useState<string[]>([]);
  const [clockTick, setClockTick] = useState(Date.now());
  const overlayOpacity = useRef(new Animated.Value(0)).current;
  const sheetTranslateY = useRef(new Animated.Value(420)).current;
  const advancedDeadline = useRef<string | null>(null);

  async function load() {
    try {
      const [data, memberData] = await Promise.all([getClub(clubId, userId), getMyClubMembership(clubId, userId)]);
      setClub(data.club);
      setMembership(memberData);
      setChallenge(data.challenge);
      setRanking(data.ranking);
      setMyChallengeColor(data.myChallengeColor);
      setMyChallengeStatus(data.myChallengeStatus);
      setIsChallengeParticipant(data.isChallengeParticipant);
      setSubmittedCount(data.submittedCount);
      setParticipantCount(data.participantCount);
    } catch (caught) { setError((caught as Error).message); }
    setLoading(false);
  }

  useEffect(() => { void load(); }, [clubId]);

  useEffect(() => {
    if (!challenge) return;
    const channel = supabase.channel(`club-challenge-${challenge.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'challenge_participants', filter: `challenge_id=eq.${challenge.id}` }, () => void load())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'challenges', filter: `id=eq.${challenge.id}` }, () => void load())
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [challenge?.id]);

  useEffect(() => {
    const interval = setInterval(() => setClockTick(Date.now()), 1000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (!challenge || !['active', 'configuring', 'voting'].includes(challenge.status)) return;
    const deadline = challenge.status === 'voting' ? challenge.voting_ends_at : challenge.ends_at;
    if (!deadline || new Date(deadline).getTime() > clockTick) return;
    const deadlineKey = `${challenge.id}:${challenge.status}:${deadline}`;
    if (advancedDeadline.current === deadlineKey) return;
    advancedDeadline.current = deadlineKey;
    void advanceChallenge(challenge.id).finally(() => load());
  }, [challenge?.id, challenge?.status, challenge?.ends_at, challenge?.voting_ends_at, clockTick]);

  useEffect(() => {
    if (!inviteOpen) return;
    overlayOpacity.setValue(0);
    sheetTranslateY.setValue(420);
    Animated.parallel([
      Animated.timing(overlayOpacity, { toValue: 1, duration: 180, useNativeDriver: true }),
      Animated.spring(sheetTranslateY, { toValue: 0, damping: 20, mass: 0.8, stiffness: 180, useNativeDriver: true }),
    ]).start();
  }, [inviteOpen, overlayOpacity, sheetTranslateY]);

  function closeInvite() {
    Animated.parallel([
      Animated.timing(overlayOpacity, { toValue: 0, duration: 140, useNativeDriver: true }),
      Animated.timing(sheetTranslateY, { toValue: 420, duration: 180, useNativeDriver: true }),
    ]).start(() => setInviteOpen(false));
  }

  function showToast(text: string) {
    setToast(text);
    setToastKey((current) => current + 1);
  }

  async function copyCode() {
    if (!club) return;
    await Clipboard.setStringAsync(club.invite_code);
    showToast('Código del grupo copiado.');
  }

  async function openInvite() {
    setInviteError(null);
    setIdentifier('');
    setInvitedFriendIds([]);
    setMemberUserIds([]);
    if (club && !club.invites_enabled) { showToast('Las invitaciones están pausadas.'); return; }
    setInviteOpen(true);
    try {
      const [relationships, members] = await Promise.all([getFriendships(), getClubMembers(clubId)]);
      setFriends(relationships.filter((item) => item.status === 'accepted').map((item: Friendship) => item.requester_id === userId ? item.addressee : item.requester));
      setMemberUserIds(members.map((member) => member.user_id));
    } catch (caught) { setInviteError((caught as Error).message); }
  }

  async function invite(identifierToInvite: string, friendId?: string) {
    if (!club || !identifierToInvite.trim()) return;
    setInviting(true);
    setInviteError(null);
    try {
      await inviteUserToClub(club.id, identifierToInvite);
      setIdentifier('');
      if (friendId) setInvitedFriendIds((current) => current.includes(friendId) ? current : [...current, friendId]);
      showToast('Invitación enviada.');
    } catch (caught) { setInviteError((caught as Error).message); }
    setInviting(false);
  }

  if (loading || !club) return <Screen><Header title="Club" onBack={onBack} /><ActivityIndicator style={styles.loader} color={colors.coral} /></Screen>;

  const challengeColor = challenge?.shared_color ?? myChallengeColor ?? colors.line;
  const canOpenChallenge = !challenge || challenge.status === 'closed' || isChallengeParticipant;
  const canCreateChallenge = club.admin_id === userId || membership?.role === 'admin' || club.challenge_creation_policy === 'all_members' || (club.challenge_creation_policy === 'admins_moderators' && membership?.role === 'moderator');
  const challengeExpired = challenge ? new Date(challenge.ends_at).getTime() <= clockTick : false;
  const everyoneSubmitted = participantCount > 0 && submittedCount >= participantCount;
  const isWaitingForOthers = challenge?.status === 'active' && myChallengeStatus === 'submitted' && !everyoneSubmitted && !challengeExpired;
  const isWaitingForVoting = challenge?.status === 'active' && myChallengeStatus === 'submitted' && (everyoneSubmitted || challengeExpired);
  const challengeTitle = !canOpenChallenge ? 'Reto ya en curso' : challenge?.status === 'voting' ? 'Elige el mejor collage' : isWaitingForVoting ? 'Todo listo' : isWaitingForOthers ? 'Esperando al resto' : 'Encuentra este color';
  const challengeTimer = !canOpenChallenge ? 'Podrás participar en el siguiente reto' : challenge?.status === 'voting' && challenge.voting_ends_at ? `Vota en ${countdown(challenge.voting_ends_at)}` : challenge?.status === 'active' ? countdown(challenge.ends_at) : 'Abrir reto →';
  const showWaitingSwatch = isWaitingForOthers || isWaitingForVoting;

  return (
    <Screen>
      <Header title={club.name} onBack={onBack} />
      <View style={styles.hero}>
        <View style={styles.heroCopy}>
          <Text style={styles.heroKicker}>Grupo privado</Text>
          <Text style={styles.heroTitle}>{club.name}</Text>
          <Text style={styles.heroMeta}>Temporada actual · Ranking por votos</Text>
        </View>
        <View style={styles.heroShape} />
        <View style={styles.heroRing} />
      </View>

      <View style={styles.actionsRow}>
        <Pressable disabled={!club.chat_enabled} onPress={onChat} style={({ pressed }) => [styles.actionCard, !club.chat_enabled && styles.disabledAction, pressed && styles.pressed]}>
          <View style={styles.actionIcon}><Ionicons color={colors.ink} name="chatbubbles-outline" size={20} /></View>
          <View style={styles.actionText}><Text style={styles.actionTitle}>Chat</Text><Text style={styles.actionMeta}>{club.chat_enabled ? 'Hablar con el grupo' : 'Desactivado por admin'}</Text></View>
        </Pressable>
        <Pressable disabled={!club.invites_enabled} onPress={openInvite} style={({ pressed }) => [styles.actionCard, styles.inviteCard, !club.invites_enabled && styles.disabledAction, pressed && styles.pressed]}>
          <View style={styles.actionIcon}><Ionicons color={colors.ink} name="person-add-outline" size={20} /></View>
          <View style={styles.actionText}><Text style={styles.actionTitle}>Invitar</Text><Text style={styles.actionMeta}>{club.invites_enabled ? 'Amigos o código' : 'Invitaciones pausadas'}</Text></View>
        </Pressable>
      </View>

      {club.admin_id === userId && (
        <Pressable onPress={onManage} style={({ pressed }) => [styles.adminCard, pressed && styles.pressed]}>
          <View style={styles.adminHeader}>
            <View style={styles.adminIcon}><Ionicons color={colors.ink} name="settings-outline" size={21} /></View>
            <View style={styles.adminCopy}>
              <Text style={styles.adminTitle}>Administrar grupo</Text>
              <Text style={styles.adminMeta}>Usuarios, roles, reto actual y ajustes</Text>
            </View>
            <Ionicons color={colors.ink} name="chevron-forward" size={22} />
          </View>
        </Pressable>
      )}

      <ErrorText message={error} />
      {challenge && challenge.status !== 'closed' ? (
        <Pressable disabled={!canOpenChallenge} onPress={() => onChallenge(challenge.id)} style={({ pressed }) => [styles.challenge, !canOpenChallenge && styles.lockedChallenge, pressed && styles.pressed]}>
          <View style={styles.challengeCopy}>
            <Text style={styles.status}>{statusLabel[challenge.status]}</Text>
            <Text style={styles.challengeTitle}>{challengeTitle}</Text>
            <Text style={styles.timer}>{challengeTimer}</Text>
          </View>
          <View style={[styles.swatch, { backgroundColor: showWaitingSwatch ? colors.green : challengeColor }]}>
            {showWaitingSwatch && <Ionicons color={colors.ink} name={isWaitingForVoting ? 'hourglass-outline' : 'checkmark'} size={27} />}
          </View>
        </Pressable>
      ) : canCreateChallenge ? (
        <Pressable onPress={onNewChallenge} style={({ pressed }) => [styles.emptyChallenge, pressed && styles.pressed]}>
          <Ionicons color={colors.ink} name="sparkles-outline" size={26} />
          <Text style={styles.emptyChallengeTitle}>Lanzar nuevo reto</Text>
          <Body>Elige un color y pon el club en marcha.</Body>
        </Pressable>
      ) : (
        <Card style={styles.emptyChallengeNotice}><Body>El admin todavía no ha lanzado un reto.</Body></Card>
      )}

      {challenge?.status === 'closed' && (
        <View style={styles.closedChallengeActions}>
          <Pressable onPress={() => onChallenge(challenge.id)} style={({ pressed }) => [styles.lastResultCard, pressed && styles.pressed]}>
            <View style={styles.lastResultIcon}><Ionicons color={colors.ink} name="trophy-outline" size={20} /></View>
            <View style={styles.lastResultCopy}>
              <Text style={styles.lastResultTitle}>Ver último resultado</Text>
              <Text style={styles.lastResultMeta}>Collages, votos y ganador</Text>
            </View>
            <Ionicons color={colors.ink} name="chevron-forward" size={22} />
          </Pressable>
          {club.admin_id === userId && <Button label="Lanzar un nuevo reto" onPress={onNewChallenge} />}
        </View>
      )}

      <View style={styles.rankingHeader}><Title size="medium">Clasificación</Title><Text style={styles.rule}>1 voto = 1 punto</Text></View>
      {ranking.length === 0 ? <Card style={styles.emptyRanking}><Body>Aquí aparecerá el ranking al cerrar el primer reto.</Body></Card> : ranking.map((row, index) => (
        <View key={row.user_id} style={[styles.rankRow, index === 0 ? styles.rankFirst : index === 1 ? styles.rankSecond : index === 2 ? styles.rankThird : styles.rankRest]}>
          <Text style={styles.position}>{String(row.position).padStart(2, '0')}</Text>
          <Text style={styles.name}>{row.display_name}{row.user_id === userId ? ' (tú)' : ''}</Text>
          <Text style={styles.points}>{row.points} pt{row.points === 1 ? '' : 's'}</Text>
        </View>
      ))}

      <Modal animationType="none" transparent visible={inviteOpen} onRequestClose={closeInvite}>
        <View style={styles.modalRoot}>
          <Animated.View pointerEvents="none" style={[styles.scrim, { opacity: overlayOpacity }]} />
          <Pressable style={StyleSheet.absoluteFill} onPress={closeInvite} />
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} keyboardVerticalOffset={6} pointerEvents="box-none" style={styles.sheetHost}>
            <Animated.View style={{ transform: [{ translateY: sheetTranslateY }] }}>
              <ScrollView bounces={false} contentContainerStyle={styles.sheetContent} keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} style={styles.sheet}>
                <View style={styles.sheetHandle} />
                <View style={styles.sheetHero}>
                  <View style={styles.sheetIcon}><Ionicons color={colors.ink} name="people-outline" size={25} /></View>
                  <View style={styles.sheetTitleWrap}><Text style={styles.sheetKicker}>Invitar al grupo</Text><Text style={styles.sheetTitle}>{club.name}</Text></View>
                </View>
                <Pressable onPress={copyCode} style={({ pressed }) => [styles.inviteCodeCard, pressed && styles.pressed]}>
                  <View><Text style={styles.inviteCodeLabel}>Código del grupo</Text><Text style={styles.inviteCode}>{club.invite_code}</Text></View>
                  <View style={styles.inviteCodeIcon}><Ionicons color={colors.ink} name="copy-outline" size={19} /></View>
                </Pressable>
                <Field label="Amigo o código" value={identifier} onChangeText={setIdentifier} autoCapitalize="none" autoCorrect={false} placeholder="@amigo o CC-A1B2C3D4E5F6" />
                <Button label="Enviar invitación" onPress={() => void invite(identifier)} loading={inviting} disabled={!identifier.trim()} />
                <ErrorText message={inviteError} />
                {friends.length > 0 && <Text style={styles.friendSection}>Tus amigos</Text>}
                <View style={styles.friendList}>
                  {friends.map((friend) => {
                    const alreadyMember = memberUserIds.includes(friend.id);
                    const invited = alreadyMember || invitedFriendIds.includes(friend.id);
                    return <Pressable key={friend.id} disabled={invited} onPress={() => void invite(friend.username, friend.id)} style={({ pressed }) => [styles.friendRow, invited && styles.friendInvited, pressed && styles.pressed]}>
                      <View style={styles.friendAvatar}>{friend.avatar_url ? <Image source={{ uri: friend.avatar_url }} style={styles.friendImage} /> : <Text style={[styles.friendInitial, { backgroundColor: friend.avatar_color ?? colors.ink }]}>{friend.display_name.charAt(0).toUpperCase()}</Text>}</View>
                      <View style={styles.friendCopy}><Text style={styles.friendName}>{friend.display_name}</Text><Text style={styles.friendUsername}>{alreadyMember ? 'Ya está en el grupo' : invited ? 'Invitado' : `@${friend.username}`}</Text></View>
                      <View style={[styles.inviteStatus, invited && styles.inviteStatusDone]}><Ionicons color={colors.ink} name={invited ? 'checkmark' : 'add'} size={18} /></View>
                    </Pressable>;
                  })}
                </View>
                <Button label="Cerrar" onPress={closeInvite} variant="quiet" />
              </ScrollView>
              <ToastBubble message={toast} onHidden={() => setToast(null)} trigger={toastKey} compact style={styles.sheetToast} />
            </Animated.View>
          </KeyboardAvoidingView>
        </View>
      </Modal>

      {!inviteOpen && <ToastOverlay message={toast} onHidden={() => setToast(null)} trigger={toastKey} />}
    </Screen>
  );
}

const styles = StyleSheet.create({
  loader: { marginTop: 100 },
  hero: { minHeight: 190, marginTop: 22, marginBottom: 12, padding: 24, borderRadius: 30, backgroundColor: colors.lavender, overflow: 'hidden', justifyContent: 'flex-end' },
  heroCopy: { zIndex: 2, maxWidth: '76%' },
  heroKicker: { color: colors.ink, fontSize: 13, fontWeight: '700', opacity: 0.65, marginBottom: 6 },
  heroTitle: { color: colors.ink, fontSize: 38, lineHeight: 39, fontWeight: '900', letterSpacing: -1.2 },
  heroMeta: { color: colors.ink, fontSize: 13, marginTop: 10, opacity: 0.75 },
  heroShape: { position: 'absolute', width: 118, height: 118, borderRadius: 38, backgroundColor: colors.orange, right: -20, top: -12, transform: [{ rotate: '20deg' }] },
  heroRing: { position: 'absolute', right: 30, bottom: -34, width: 92, height: 92, borderRadius: 46, borderWidth: 22, borderColor: colors.yellow },
  actionsRow: { flexDirection: 'row', gap: 10, marginBottom: 18 },
  actionCard: { flex: 1, minHeight: 82, padding: 14, borderRadius: 24, backgroundColor: colors.blue, flexDirection: 'row', alignItems: 'center', gap: 10 },
  inviteCard: { backgroundColor: colors.green },
  disabledAction: { opacity: 0.48 },
  actionIcon: { width: 42, height: 42, borderRadius: 15, backgroundColor: '#FFFFFF88', alignItems: 'center', justifyContent: 'center' },
  actionText: { flex: 1 },
  actionTitle: { color: colors.ink, fontSize: 15, fontWeight: '900' },
  actionMeta: { color: colors.ink, opacity: 0.68, fontSize: 10, fontWeight: '700', marginTop: 3 },
  adminCard: { minHeight: 92, marginBottom: 18, padding: 18, borderRadius: 28, backgroundColor: colors.pink, justifyContent: 'center' },
  adminHeader: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  adminIcon: { width: 46, height: 46, borderRadius: 17, backgroundColor: '#FFFFFF88', alignItems: 'center', justifyContent: 'center' },
  adminCopy: { flex: 1 },
  adminTitle: { color: colors.ink, fontSize: 19, fontWeight: '900' },
  adminMeta: { color: colors.ink, opacity: 0.65, fontSize: 12, marginTop: 2 },
  challenge: { backgroundColor: colors.orange, borderRadius: 28, minHeight: 218, padding: 24, marginBottom: 18, overflow: 'hidden', flexDirection: 'row', justifyContent: 'space-between' },
  lockedChallenge: { opacity: 0.78 },
  challengeCopy: { flex: 1, justifyContent: 'space-between' },
  status: { color: colors.ink, fontSize: 12, fontWeight: '800' },
  timer: { color: colors.ink, fontWeight: '800', marginTop: 15 },
  challengeTitle: { color: colors.ink, fontSize: 30, lineHeight: 33, fontWeight: '900', maxWidth: 230 },
  swatch: { width: 64, height: 64, borderRadius: 22, borderWidth: 6, borderColor: '#FFFFFF88', alignSelf: 'flex-end', alignItems: 'center', justifyContent: 'center' },
  emptyChallenge: { minHeight: 170, padding: 22, borderRadius: 28, backgroundColor: colors.orange, gap: 9, justifyContent: 'center', marginBottom: 16 },
  emptyChallengeTitle: { color: colors.ink, fontSize: 24, fontWeight: '900' },
  emptyChallengeNotice: { backgroundColor: colors.yellow, borderWidth: 0, marginBottom: 2 },
  closedChallengeActions: { marginTop: 14, marginBottom: 2, gap: 10 },
  lastResultCard: { minHeight: 86, padding: 16, borderRadius: 26, backgroundColor: colors.lavender, flexDirection: 'row', alignItems: 'center', gap: 12 },
  lastResultIcon: { width: 46, height: 46, borderRadius: 17, backgroundColor: '#FFFFFF88', alignItems: 'center', justifyContent: 'center' },
  lastResultCopy: { flex: 1 },
  lastResultTitle: { color: colors.ink, fontSize: 18, fontWeight: '900' },
  lastResultMeta: { color: colors.ink, opacity: 0.65, fontSize: 12, marginTop: 2 },
  pressed: { opacity: 0.72 },
  rankingHeader: { marginTop: 22, marginBottom: 12, flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between' },
  rule: { color: colors.muted, fontSize: 12 },
  rankRow: { minHeight: 68, marginBottom: 8, paddingHorizontal: 16, borderRadius: 20, flexDirection: 'row', alignItems: 'center' },
  rankFirst: { backgroundColor: colors.yellow },
  rankSecond: { backgroundColor: colors.lavender },
  rankThird: { backgroundColor: colors.green },
  rankRest: { backgroundColor: colors.line },
  position: { width: 42, color: colors.ink, fontWeight: '800' },
  name: { flex: 1, color: colors.ink, fontSize: 16, fontWeight: '700' },
  points: { color: colors.ink, fontWeight: '800' },
  emptyRanking: { backgroundColor: colors.surface, borderColor: colors.line },
  modalRoot: { flex: 1, justifyContent: 'flex-end' },
  scrim: { ...StyleSheet.absoluteFillObject, backgroundColor: '#00000066' },
  sheetHost: { justifyContent: 'flex-end' },
  sheet: { flexGrow: 0, minHeight: 560, maxHeight: '94%', marginHorizontal: 10, marginBottom: 4, backgroundColor: colors.paper, borderRadius: 34 },
  sheetContent: { flexGrow: 1, padding: 22, paddingTop: 12, paddingBottom: 24, gap: 14 },
  sheetHandle: { alignSelf: 'center', width: 42, height: 5, borderRadius: 3, backgroundColor: '#D6D4CD', marginBottom: 8 },
  sheetHero: { minHeight: 112, padding: 18, borderRadius: 28, backgroundColor: colors.lavender, flexDirection: 'row', alignItems: 'center', gap: 14 },
  sheetIcon: { width: 52, height: 52, borderRadius: 19, backgroundColor: colors.white, alignItems: 'center', justifyContent: 'center' },
  sheetTitleWrap: { flex: 1 },
  sheetKicker: { color: colors.ink, fontSize: 12, fontWeight: '700', opacity: 0.65, marginBottom: 4 },
  sheetTitle: { color: colors.ink, fontSize: 24, lineHeight: 27, fontWeight: '900' },
  inviteCodeCard: { minHeight: 76, paddingHorizontal: 16, borderRadius: 24, backgroundColor: colors.green, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  inviteCodeLabel: { color: colors.ink, opacity: 0.65, fontSize: 12, fontWeight: '800', marginBottom: 4 },
  inviteCode: { color: colors.ink, fontSize: 22, fontWeight: '900', letterSpacing: 1 },
  inviteCodeIcon: { width: 42, height: 42, borderRadius: 16, backgroundColor: '#FFFFFF88', alignItems: 'center', justifyContent: 'center' },
  friendSection: { color: colors.ink, fontSize: 18, fontWeight: '900', marginTop: 6 },
  friendList: { gap: 8 },
  friendRow: { minHeight: 70, paddingHorizontal: 14, borderRadius: 22, backgroundColor: colors.surface, flexDirection: 'row', alignItems: 'center', gap: 12 },
  friendInvited: { backgroundColor: colors.green },
  friendAvatar: { width: 42, height: 42, borderRadius: 21, backgroundColor: colors.ink, alignItems: 'center', justifyContent: 'center' },
  friendImage: { width: 42, height: 42, borderRadius: 21 },
  friendInitial: { width: 42, height: 42, borderRadius: 21, overflow: 'hidden', color: colors.white, fontSize: 16, lineHeight: 42, textAlign: 'center', fontWeight: '800' },
  friendCopy: { flex: 1 },
  friendName: { color: colors.ink, fontWeight: '800', fontSize: 15 },
  friendUsername: { color: colors.muted, fontSize: 12 },
  inviteStatus: { width: 32, height: 32, borderRadius: 16, backgroundColor: colors.line, alignItems: 'center', justifyContent: 'center' },
  inviteStatusDone: { backgroundColor: colors.white },
  sheetToast: { position: 'absolute', left: 18, right: 18, bottom: 18 },
});
