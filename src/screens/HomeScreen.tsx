import { useEffect, useRef, useState } from 'react';
import { Animated, Image, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Body, Button, ErrorText, Field, Screen, SkeletonBlock, Title } from '@/components/ui';
import { createClub, getHomeDashboard, joinClub } from '@/lib/api';
import { colors } from '@/lib/theme';
import type { Challenge, Club, Profile } from '@/types/domain';

const cardColors = [colors.orange, colors.blue, colors.pink, colors.green, colors.lavender];

type HomeDashboard = {
  userId: string;
  clubs: Club[];
  profile: Profile;
  challenge: (Challenge & { club_name: string; is_accessible: boolean }) | null;
};

let cachedDashboard: HomeDashboard | null = null;

function timeLeft(date: string) {
  const milliseconds = Math.max(0, new Date(date).getTime() - Date.now());
  const hours = Math.floor(milliseconds / 3_600_000);
  return hours > 48 ? `${Math.ceil(hours / 24)} días` : `${hours} h`;
}

function HomeSkeleton() {
  return (
    <View style={styles.skeletonWrap}>
      <SkeletonBlock style={styles.skeletonHero} />
      <View style={styles.skeletonHeader}><SkeletonBlock style={styles.skeletonTitle} /><SkeletonBlock style={styles.skeletonLink} /></View>
      <View style={styles.skeletonGrid}><SkeletonBlock style={styles.skeletonClubWide} /><SkeletonBlock style={styles.skeletonClub} /><SkeletonBlock style={styles.skeletonClub} /></View>
    </View>
  );
}

export function HomeScreen({ userId, onOpenClub, onOpenChallenge }: { userId: string; onOpenClub: (id: string) => void; onOpenChallenge: (clubId: string, challengeId: string) => void }) {
  const initialDashboard = cachedDashboard?.userId === userId ? cachedDashboard : null;
  const [clubs, setClubs] = useState<Club[]>(initialDashboard?.clubs ?? []);
  const [profile, setProfile] = useState<Profile | null>(initialDashboard?.profile ?? null);
  const [challenge, setChallenge] = useState<(Challenge & { club_name: string; is_accessible: boolean }) | null>(initialDashboard?.challenge ?? null);
  const [loading, setLoading] = useState(!initialDashboard);
  const [modal, setModal] = useState<'create' | 'join' | null>(null);
  const [value, setValue] = useState('');
  const [monthly, setMonthly] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const overlayOpacity = useRef(new Animated.Value(0)).current;
  const sheetTranslateY = useRef(new Animated.Value(420)).current;

  async function load(showSpinner = false) {
    if (showSpinner) setLoading(true);
    try {
      const data = await getHomeDashboard(userId);
      cachedDashboard = { userId, clubs: data.clubs, profile: data.profile, challenge: data.challenge };
      setClubs(data.clubs);
      setProfile(data.profile);
      setChallenge(data.challenge);
    } catch (caught) { setError((caught as Error).message); }
    setLoading(false);
  }

  useEffect(() => { void load(!cachedDashboard || cachedDashboard.userId !== userId); }, [userId]);

  useEffect(() => {
    if (!modal) return;
    overlayOpacity.setValue(0);
    sheetTranslateY.setValue(420);
    Animated.parallel([
      Animated.timing(overlayOpacity, {
        toValue: 1,
        duration: 180,
        useNativeDriver: true,
      }),
      Animated.spring(sheetTranslateY, {
        toValue: 0,
        damping: 20,
        mass: 0.8,
        stiffness: 180,
        useNativeDriver: true,
      }),
    ]).start();
  }, [modal, overlayOpacity, sheetTranslateY]);

  function open(kind: 'create' | 'join') {
    setValue('');
    setError(null);
    setModal(kind);
  }

  function closeModal() {
    Animated.parallel([
      Animated.timing(overlayOpacity, {
        toValue: 0,
        duration: 140,
        useNativeDriver: true,
      }),
      Animated.timing(sheetTranslateY, {
        toValue: 420,
        duration: 180,
        useNativeDriver: true,
      }),
    ]).start(() => setModal(null));
  }

  async function save() {
    if (!value.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const id = modal === 'create' ? await createClub(value.trim(), monthly) : await joinClub(value.trim());
      setModal(null);
      await load(true);
      onOpenClub(id);
    } catch (caught) { setError((caught as Error).message); }
    setSaving(false);
  }

  const date = new Intl.DateTimeFormat('es-ES', { weekday: 'long', day: 'numeric', month: 'short' }).format(new Date());
  const firstName = profile?.display_name.split(' ')[0] ?? 'Colorista';
  const challengeLocked = Boolean(challenge && !challenge.is_accessible);

  return (
    <Screen>
      <View style={styles.topbar}>
        <View style={styles.avatar}>{profile?.avatar_url ? <Image source={{ uri: profile.avatar_url }} style={styles.avatarImage} /> : <Text style={styles.avatarText}>{firstName.charAt(0).toUpperCase()}</Text>}</View>
        <View style={styles.greeting}><Text style={styles.hello}>Hola, {firstName}</Text><Text style={styles.date}>{date}</Text></View>
        <Pressable onPress={() => open('create')} style={styles.topAction}><Ionicons name="add" size={26} color={colors.ink} /></Pressable>
      </View>

      {loading ? <HomeSkeleton /> : (
        <>
          <Pressable
            disabled={!challenge || challengeLocked}
            onPress={() => challenge && onOpenChallenge(challenge.club_id, challenge.id)}
            style={({ pressed }) => [styles.challengeHero, challengeLocked && styles.challengeHeroLocked, pressed && styles.pressed]}
          >
            <View style={styles.heroCopy}>
              <Text style={styles.heroKicker}>{challenge ? challenge.club_name : 'Color Club'}</Text>
              <Text style={styles.heroTitle}>{challengeLocked ? 'Retos en\ntus clubs' : challenge ? (challenge.status === 'voting' ? 'Hora de\nvotar' : 'Reto\nen curso') : 'Tu próximo\nreto empieza aquí'}</Text>
              <Text style={styles.heroMeta}>{challengeLocked ? 'Hay un reto activo, pero empezó antes de que entraras. Si otro club lanza uno nuevo, aparecerá aquí.' : challenge ? (challenge.status === 'voting' ? 'Elige tu collage favorito' : `${timeLeft(challenge.ends_at)} para completar ${challenge.photo_count ?? 6} fotos`) : 'Crea un club e invita a tus amigos'}</Text>
              {challenge && <Text style={styles.heroLink}>{challengeLocked ? 'Esperando próximo reto' : 'Abrir reto  →'}</Text>}
            </View>
            <View style={styles.sculpture}>
              <View style={[styles.shape, styles.shapeOne, { backgroundColor: challenge?.shared_color ?? colors.orange }]} />
              <View style={[styles.shape, styles.shapeTwo]} />
              <View style={[styles.shape, styles.shapeThree]} />
              <View style={[styles.ring, { borderColor: colors.yellow }]} />
            </View>
          </Pressable>

          <View style={styles.sectionHeader}><Title size="medium">Tus clubs</Title><Pressable onPress={() => open('join')}><Text style={styles.joinLink}>Usar código</Text></Pressable></View>
          <ErrorText message={!modal ? error : null} />
          {clubs.length === 0 ? (
            <Pressable onPress={() => open('create')} style={styles.empty}><Ionicons name="add-circle-outline" size={30} color={colors.ink} /><Text style={styles.emptyTitle}>Crea tu primer club</Text><Body muted>Necesitas amigos para empezar a jugar.</Body></Pressable>
          ) : (
            <View style={styles.clubGrid}>
              {clubs.map((club, index) => (
                <Pressable key={club.id} onPress={() => onOpenClub(club.id)} style={({ pressed }) => [styles.clubCard, { backgroundColor: cardColors[index % cardColors.length] }, index % 3 === 0 && styles.clubCardWide, pressed && styles.pressed]}>
                  <View style={styles.clubBadge}><Text style={styles.clubBadgeText}>Club {String(index + 1).padStart(2, '0')}</Text></View>
                  <Text style={styles.clubName}>{club.name}</Text>
                  <View style={styles.clubFooter}><Text style={styles.clubCode}>{club.invite_code}</Text><View style={styles.arrowCircle}><Ionicons name="arrow-forward" size={16} color={colors.ink} /></View></View>
                </Pressable>
              ))}
              <Pressable onPress={() => open('create')} style={styles.addCard}><Ionicons name="add" size={30} color={colors.ink} /><Text style={styles.addText}>Nuevo club</Text></Pressable>
            </View>
          )}
        </>
      )}

      <Modal animationType="none" transparent visible={modal !== null} onRequestClose={closeModal}>
        <View style={styles.modalRoot}>
          <Animated.View pointerEvents="none" style={[styles.scrim, { opacity: overlayOpacity }]} />
          <Pressable accessibilityRole="button" accessibilityLabel="Cerrar" style={StyleSheet.absoluteFill} onPress={closeModal} />
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} keyboardVerticalOffset={6} pointerEvents="box-none" style={styles.sheetHost}>
            <Animated.View style={{ transform: [{ translateY: sheetTranslateY }] }}>
              <ScrollView bounces={false} contentContainerStyle={styles.sheetContent} keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'} keyboardShouldPersistTaps="handled" showsHorizontalScrollIndicator={false} showsVerticalScrollIndicator={false} style={styles.sheet}>
                <View style={styles.sheetHandle} />
                <View style={styles.sheetHero}>
                  <View style={styles.sheetIcon}><Ionicons color={colors.ink} name={modal === 'create' ? 'color-palette-outline' : 'ticket-outline'} size={25} /></View>
                  <View style={styles.sheetTitleWrap}>
                    <Text style={styles.sheetKicker}>{modal === 'create' ? 'Nuevo club' : 'Invitación'}</Text>
                    <Text style={styles.sheetTitle}>{modal === 'create' ? 'Crea un espacio de juego' : 'Únete a tus amigos'}</Text>
                  </View>
                  <View style={styles.sheetBubble} />
                </View>
                <Field label={modal === 'create' ? 'Nombre del club' : 'Código de invitación'} value={value} onChangeText={setValue} autoCapitalize={modal === 'join' ? 'characters' : 'words'} placeholder={modal === 'create' ? 'Ej. Viernes de color' : 'AB12CD34'} />
                {modal === 'create' && <View style={styles.switchRow}><View style={styles.switchText}><Text style={styles.switchTitle}>Temporada mensual</Text><Body muted>El marcador se reinicia automáticamente cada mes.</Body></View><View style={styles.switchSlot}><Switch value={monthly} onValueChange={setMonthly} trackColor={{ true: colors.ink }} /></View></View>}
                <ErrorText message={error} />
                <Button label={modal === 'create' ? 'Crear club' : 'Unirme al club'} onPress={save} loading={saving} disabled={!value.trim()} />
                <Button label="Cancelar" onPress={closeModal} variant="quiet" />
              </ScrollView>
            </Animated.View>
          </KeyboardAvoidingView>
        </View>
      </Modal>
    </Screen>
  );
}

const styles = StyleSheet.create({
  topbar: { minHeight: 88, flexDirection: 'row', alignItems: 'center', gap: 12 },
  avatar: { width: 48, height: 48, borderRadius: 24, backgroundColor: colors.orange, alignItems: 'center', justifyContent: 'center' },
  avatarImage: { width: 48, height: 48, borderRadius: 24 },
  avatarText: { color: colors.ink, fontSize: 18, fontWeight: '800' },
  greeting: { flex: 1 },
  hello: { color: colors.ink, fontSize: 19, fontWeight: '700' },
  date: { color: colors.muted, fontSize: 14, marginTop: 2, textTransform: 'capitalize' },
  topAction: { width: 48, height: 48, borderRadius: 24, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
  skeletonWrap: { gap: 18, marginTop: 12 },
  skeletonHero: { height: 284, borderRadius: 30 },
  skeletonHeader: { marginTop: 4, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  skeletonTitle: { width: 120, height: 32 },
  skeletonLink: { width: 78, height: 18, borderRadius: 9 },
  skeletonGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  skeletonClubWide: { width: '100%', height: 176, borderRadius: 26 },
  skeletonClub: { width: '48.5%', height: 150, borderRadius: 26 },
  challengeHero: { minHeight: 284, marginTop: 12, padding: 24, borderRadius: 30, backgroundColor: colors.lavender, overflow: 'hidden' },
  challengeHeroLocked: { backgroundColor: colors.blue },
  heroCopy: { zIndex: 2, width: '66%' },
  heroKicker: { color: colors.ink, fontSize: 13, fontWeight: '600', marginBottom: 14 },
  heroTitle: { color: colors.ink, fontSize: 38, lineHeight: 38, fontWeight: '900', letterSpacing: -1.5 },
  heroMeta: { color: colors.ink, fontSize: 13, lineHeight: 18, marginTop: 12 },
  heroLink: { color: colors.ink, fontSize: 13, fontWeight: '800', marginTop: 20 },
  sculpture: { position: 'absolute', width: 155, height: 190, right: -8, bottom: 5 },
  shape: { position: 'absolute', width: 76, height: 76, borderRadius: 25, shadowColor: colors.ink, shadowOpacity: 0.18, shadowRadius: 8, shadowOffset: { width: 0, height: 7 } },
  shapeOne: { right: 14, top: 8, transform: [{ rotate: '24deg' }] },
  shapeTwo: { left: 5, top: 55, backgroundColor: '#354552', transform: [{ rotate: '-14deg' }] },
  shapeThree: { right: 8, bottom: 8, backgroundColor: '#D9CAD1', transform: [{ rotate: '12deg' }] },
  ring: { position: 'absolute', width: 72, height: 72, borderRadius: 36, borderWidth: 18, left: 21, bottom: 4 },
  pressed: { opacity: 0.72 },
  sectionHeader: { marginTop: 22, marginBottom: 15, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  joinLink: { color: colors.ink, fontSize: 13, fontWeight: '700' },
  empty: { minHeight: 180, padding: 24, borderRadius: 26, backgroundColor: colors.orange, justifyContent: 'center', gap: 8 },
  emptyTitle: { color: colors.ink, fontSize: 23, fontWeight: '800' },
  clubGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  clubCard: { width: '48.5%', minHeight: 190, padding: 18, borderRadius: 26, justifyContent: 'space-between' },
  clubCardWide: { width: '100%', minHeight: 176 },
  clubBadge: { alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 14, backgroundColor: '#FFFFFF70' },
  clubBadgeText: { color: colors.ink, fontSize: 11, fontWeight: '600' },
  clubName: { color: colors.ink, fontSize: 23, lineHeight: 26, fontWeight: '800' },
  clubFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  clubCode: { color: colors.ink, fontSize: 11, fontWeight: '600' },
  arrowCircle: { width: 34, height: 34, borderRadius: 17, backgroundColor: '#FFFFFF88', alignItems: 'center', justifyContent: 'center' },
  addCard: { width: '48.5%', minHeight: 150, borderWidth: 1, borderColor: colors.line, borderRadius: 26, alignItems: 'center', justifyContent: 'center', gap: 7 },
  addText: { color: colors.ink, fontSize: 13, fontWeight: '700' },
  modalRoot: { flex: 1, justifyContent: 'flex-end' },
  scrim: { ...StyleSheet.absoluteFillObject, backgroundColor: '#00000066' },
  sheetHost: { justifyContent: 'flex-end' },
  sheet: { flexGrow: 0, minHeight: 560, maxHeight: '94%', marginHorizontal: 10, marginBottom: 4, backgroundColor: colors.paper, borderRadius: 34, shadowColor: colors.ink, shadowOffset: { width: 0, height: -8 }, shadowOpacity: 0.16, shadowRadius: 24, elevation: 16 },
  sheetContent: { flexGrow: 1, padding: 22, paddingTop: 12, paddingBottom: 22, gap: 16 },
  sheetHandle: { alignSelf: 'center', width: 42, height: 5, borderRadius: 3, backgroundColor: '#D6D4CD', marginBottom: 8 },
  sheetHero: { minHeight: 134, padding: 18, borderRadius: 28, backgroundColor: colors.lavender, overflow: 'hidden', flexDirection: 'row', alignItems: 'center', gap: 14 },
  sheetIcon: { width: 52, height: 52, borderRadius: 19, backgroundColor: colors.white, alignItems: 'center', justifyContent: 'center', zIndex: 2 },
  sheetTitleWrap: { flex: 1, zIndex: 2 },
  sheetKicker: { color: colors.ink, fontSize: 12, fontWeight: '700', opacity: 0.65, marginBottom: 4 },
  sheetTitle: { color: colors.ink, fontSize: 25, lineHeight: 28, fontWeight: '900', letterSpacing: -0.7 },
  sheetBubble: { position: 'absolute', width: 96, height: 96, borderRadius: 32, backgroundColor: colors.orange, right: -20, bottom: -25, transform: [{ rotate: '18deg' }] },
  switchRow: { minHeight: 82, paddingHorizontal: 16, borderRadius: 22, backgroundColor: colors.surface, flexDirection: 'row', alignItems: 'center', gap: 15 },
  switchText: { flex: 1 },
  switchTitle: { color: colors.ink, fontWeight: '700', fontSize: 16 },
  switchSlot: { width: 54, alignItems: 'center' },
});
