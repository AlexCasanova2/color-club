import { useEffect, useRef, useState, type PropsWithChildren, type ReactNode } from 'react';
import { ActivityIndicator, Animated, Modal, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Session } from '@supabase/supabase-js';
import Constants from 'expo-constants';
import * as LocalAuthentication from 'expo-local-authentication';
import { StatusBar } from 'expo-status-bar';
import { FloatingMenu, type MenuTab } from '@/components/FloatingMenu';
import { Body, Button, Card, Screen, Title } from '@/components/ui';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';
import { getUnreadNotificationCount, markNotificationRead } from '@/lib/api';
import { registerForPushNotifications } from '@/lib/pushNotifications';
import { colors } from '@/lib/theme';
import { AuthScreen } from '@/screens/AuthScreen';
import { OnboardingScreen } from '@/screens/OnboardingScreen';
import { AccountScreen } from '@/screens/AccountScreen';
import { EditProfileScreen } from '@/screens/EditProfileScreen';
import { ActivityScreen } from '@/screens/ActivityScreen';
import { ChallengeScreen } from '@/screens/ChallengeScreen';
import { ClubScreen } from '@/screens/ClubScreen';
import { ClubChatScreen } from '@/screens/ClubChatScreen';
import { ClubManageScreen } from '@/screens/ClubManageScreen';
import { HomeScreen } from '@/screens/HomeScreen';
import { FriendsScreen } from '@/screens/FriendsScreen';
import { NewChallengeScreen } from '@/screens/NewChallengeScreen';
import type { AppNotification } from '@/types/domain';

type Route =
  | { name: 'home' }
  | { name: 'activity' }
  | { name: 'friends' }
  | { name: 'account' }
  | { name: 'edit-profile' }
  | { name: 'club'; clubId: string }
  | { name: 'club-chat'; clubId: string }
  | { name: 'club-manage'; clubId: string }
  | { name: 'new-challenge'; clubId: string }
  | { name: 'challenge'; clubId: string; challengeId: string };

const onboardingStorageKey = 'color-club:onboarding-seen:v1';

function SetupScreen() {
  return (
    <Screen>
      <View style={styles.setup}>
        <View style={styles.mark}><View style={[styles.dot, { backgroundColor: colors.coral }]} /><View style={[styles.dot, { backgroundColor: colors.yellow }]} /><View style={[styles.dot, { backgroundColor: colors.green }]} /></View>
        <Title>Color Club</Title>
        <Card style={styles.setupCard}>
          <Text style={styles.step}>CONFIGURACIÓN NECESARIA</Text>
          <Body>Crea un proyecto en Supabase, aplica la migración y añade estas variables a un archivo <Text style={styles.code}>.env</Text>:</Body>
          <Text selectable style={styles.codeBlock}>EXPO_PUBLIC_SUPABASE_URL=...{`\n`}EXPO_PUBLIC_SUPABASE_ANON_KEY=...</Text>
          <Body muted>Después reinicia Expo. Las instrucciones completas están en README.md.</Body>
        </Card>
      </View>
    </Screen>
  );
}

function BiometricLockScreen({ error, loading, onRetry, onSignOut }: { error: string | null; loading: boolean; onRetry: () => void; onSignOut: () => void }) {
  return (
    <Screen scroll={false} bottomInset={24}>
      <View style={styles.biometricLock}>
        <View style={styles.biometricIcon}><Ionicons color={colors.ink} name="scan-outline" size={40} /></View>
        <View style={styles.biometricCopy}>
          <Text style={styles.biometricEyebrow}>SESIÓN PROTEGIDA</Text>
          <Title>Desbloquea Color Club</Title>
          <Body muted>Usa Face ID para continuar con tu sesión.</Body>
        </View>
        {error && <Text style={styles.biometricError}>{error}</Text>}
        <View style={styles.biometricActions}>
          <Button label="Usar Face ID" loading={loading} onPress={onRetry} />
          <Button label="Entrar con otra cuenta" disabled={loading} onPress={onSignOut} variant="quiet" />
        </View>
      </View>
    </Screen>
  );
}

function RouteTransition({ routeKey, children }: PropsWithChildren<{ routeKey: string }>) {
  const opacity = useRef(new Animated.Value(1)).current;
  const translateY = useRef(new Animated.Value(0)).current;
  const currentKey = useRef(routeKey);
  const [displayedChildren, setDisplayedChildren] = useState<ReactNode>(children);

  useEffect(() => {
    if (currentKey.current === routeKey) return;
    Animated.parallel([
      Animated.timing(opacity, { toValue: 0, duration: 120, useNativeDriver: true }),
      Animated.timing(translateY, { toValue: -8, duration: 120, useNativeDriver: true }),
    ]).start(() => {
      currentKey.current = routeKey;
      setDisplayedChildren(children);
      translateY.setValue(10);
      Animated.parallel([
        Animated.timing(opacity, { toValue: 1, duration: 210, useNativeDriver: true }),
        Animated.spring(translateY, { toValue: 0, damping: 22, mass: 0.7, stiffness: 180, useNativeDriver: true }),
      ]).start();
    });
  }, [children, opacity, routeKey, translateY]);

  return <Animated.View style={[styles.route, { opacity, transform: [{ translateY }] }]}>{displayedChildren}</Animated.View>;
}

export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [checking, setChecking] = useState(true);
  const [checkingOnboarding, setCheckingOnboarding] = useState(true);
  const [hasSeenOnboarding, setHasSeenOnboarding] = useState(false);
  const [biometricUnlocked, setBiometricUnlocked] = useState(false);
  const [biometricLoading, setBiometricLoading] = useState(false);
  const [biometricError, setBiometricError] = useState<string | null>(null);
  const [route, setRoute] = useState<Route>({ name: 'home' });
  const [accountToast, setAccountToast] = useState<string | null>(null);
  const [notificationToast, setNotificationToast] = useState<AppNotification | null>(null);
  const [unreadNotifications, setUnreadNotifications] = useState(0);

  async function unlockWithFaceId() {
    setBiometricLoading(true);
    setBiometricError(null);
    try {
      if (Platform.OS !== 'ios' || Constants.executionEnvironment === 'storeClient') {
        setBiometricUnlocked(true);
        return;
      }
      const [hasHardware, isEnrolled, supportedTypes] = await Promise.all([
        LocalAuthentication.hasHardwareAsync(),
        LocalAuthentication.isEnrolledAsync(),
        LocalAuthentication.supportedAuthenticationTypesAsync(),
      ]);
      const supportsFaceId = supportedTypes.includes(LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION);
      if (!hasHardware || !isEnrolled || !supportsFaceId) {
        setBiometricUnlocked(true);
        return;
      }
      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: 'Desbloquea Color Club',
        cancelLabel: 'Cancelar',
        fallbackLabel: 'Usar código',
      });
      if (result.success) setBiometricUnlocked(true);
      else setBiometricError('No se pudo verificar Face ID. Puedes intentarlo de nuevo.');
    } catch {
      setBiometricError('Face ID no está disponible ahora mismo. Inténtalo de nuevo.');
    } finally {
      setBiometricLoading(false);
    }
  }

  useEffect(() => {
    if (!isSupabaseConfigured) { setChecking(false); return; }
    void supabase.auth.getSession().then(async ({ data }) => {
      setSession(data.session);
      if (data.session) await unlockWithFaceId();
      setChecking(false);
    });
    const { data } = supabase.auth.onAuthStateChange((event, nextSession) => {
      setSession(nextSession);
      if (!nextSession) {
        setBiometricUnlocked(false);
        setBiometricError(null);
        setRoute({ name: 'home' });
      } else if (event === 'SIGNED_IN') {
        setBiometricUnlocked(true);
      }
    });
    return () => data.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    void AsyncStorage.getItem(onboardingStorageKey).then((value) => setHasSeenOnboarding(value === 'true')).catch(() => undefined).finally(() => setCheckingOnboarding(false));
  }, []);

  async function finishOnboarding() {
    setHasSeenOnboarding(true);
    await AsyncStorage.setItem(onboardingStorageKey, 'true');
  }

  useEffect(() => {
    if (!session) return;
    void getUnreadNotificationCount(session.user.id).then(setUnreadNotifications).catch(() => undefined);
    const channel = supabase.channel(`notifications-${session.user.id}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${session.user.id}` }, (payload) => {
        const notification = payload.new as AppNotification;
        setNotificationToast(notification);
        setUnreadNotifications((current) => current + 1);
        setTimeout(() => setNotificationToast(null), 3200);
      })
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [session]);

  useEffect(() => {
    if (!session || !biometricUnlocked) return;
    void registerForPushNotifications().catch(() => undefined);
  }, [session?.user.id, biometricUnlocked]);

  if (!isSupabaseConfigured) return <><StatusBar style="dark" /><SetupScreen /></>;
  if (checking || checkingOnboarding) return <View style={styles.loading}><StatusBar style="dark" /><ActivityIndicator color={colors.coral} /></View>;
  if (!session && !hasSeenOnboarding) return <><StatusBar style="dark" /><OnboardingScreen onDone={() => void finishOnboarding()} /></>;
  if (!session) return <><StatusBar style="dark" /><AuthScreen /></>;
  if (!biometricUnlocked) return <><StatusBar style="dark" /><BiometricLockScreen error={biometricError} loading={biometricLoading} onRetry={() => void unlockWithFaceId()} onSignOut={() => void supabase.auth.signOut()} /></>;

  let content;
  if (route.name === 'home') {
    content = <HomeScreen userId={session.user.id} onOpenClub={(clubId) => setRoute({ name: 'club', clubId })} onOpenChallenge={(clubId, challengeId) => setRoute({ name: 'challenge', clubId, challengeId })} />;
  } else if (route.name === 'activity') {
    content = <ActivityScreen userId={session.user.id} onOpenChallenge={(clubId, challengeId) => setRoute({ name: 'challenge', clubId, challengeId })} onOpenClub={(clubId) => setRoute({ name: 'club', clubId })} onOpenFriends={() => setRoute({ name: 'friends' })} onNotificationRead={() => setUnreadNotifications((current) => Math.max(0, current - 1))} />;
  } else if (route.name === 'account') {
    content = <AccountScreen userId={session.user.id} email={session.user.email ?? ''} onEditProfile={() => setRoute({ name: 'edit-profile' })} toastMessage={accountToast} onToastShown={() => setAccountToast(null)} />;
  } else if (route.name === 'edit-profile') {
    content = <EditProfileScreen userId={session.user.id} onBack={() => setRoute({ name: 'account' })} onSaved={() => { setAccountToast('Perfil actualizado.'); setRoute({ name: 'account' }); }} />;
  } else if (route.name === 'friends') {
    content = <FriendsScreen userId={session.user.id} />;
  } else if (route.name === 'club') {
    content = (
      <ClubScreen
        clubId={route.clubId}
        userId={session.user.id}
        onBack={() => setRoute({ name: 'home' })}
        onChallenge={(challengeId) => setRoute({ name: 'challenge', clubId: route.clubId, challengeId })}
        onNewChallenge={() => setRoute({ name: 'new-challenge', clubId: route.clubId })}
        onManage={() => setRoute({ name: 'club-manage', clubId: route.clubId })}
        onChat={() => setRoute({ name: 'club-chat', clubId: route.clubId })}
      />
    );
  } else if (route.name === 'club-chat') {
    content = <ClubChatScreen clubId={route.clubId} userId={session.user.id} onBack={() => setRoute({ name: 'club', clubId: route.clubId })} />;
  } else if (route.name === 'club-manage') {
    content = <ClubManageScreen clubId={route.clubId} userId={session.user.id} onBack={() => setRoute({ name: 'club', clubId: route.clubId })} onDeleted={() => setRoute({ name: 'home' })} />;
  } else if (route.name === 'new-challenge') {
    content = (
      <NewChallengeScreen
        clubId={route.clubId}
        onBack={() => setRoute({ name: 'club', clubId: route.clubId })}
        onCreated={(challengeId) => setRoute({ name: 'challenge', clubId: route.clubId, challengeId })}
      />
    );
  } else {
    content = (
      <ChallengeScreen
        challengeId={route.challengeId}
        userId={session.user.id}
        onBack={() => setRoute({ name: 'club', clubId: route.clubId })}
      />
    );
  }

  const activeTab: MenuTab = route.name === 'activity' ? 'activity' : route.name === 'friends' ? 'friends' : route.name === 'account' ? 'account' : 'clubs';
  const routeKey = route.name === 'club' || route.name === 'club-chat' || route.name === 'club-manage' || route.name === 'new-challenge' ? `${route.name}-${route.clubId}` : route.name === 'challenge' ? `${route.name}-${route.challengeId}` : route.name;
  const showFloatingMenu = !['club-chat', 'club-manage', 'new-challenge', 'edit-profile'].includes(route.name);
  async function openNotification(notification: AppNotification) {
    setNotificationToast(null);
    if (!notification.read_at) {
      await markNotificationRead(notification.id);
      setUnreadNotifications((current) => Math.max(0, current - 1));
    }
    if (notification.type === 'challenge' && notification.related_club_id && notification.related_challenge_id) setRoute({ name: 'challenge', clubId: notification.related_club_id, challengeId: notification.related_challenge_id });
    else if (notification.type === 'club_invite') setRoute({ name: 'activity' });
    else if (notification.type === 'friend_request') setRoute({ name: 'friends' });
    else setRoute({ name: 'activity' });
  }

  function selectTab(tab: MenuTab) {
    if (tab === 'clubs') setRoute({ name: 'home' });
    else if (tab === 'activity') setRoute({ name: 'activity' });
    else if (tab === 'friends') setRoute({ name: 'friends' });
    else setRoute({ name: 'account' });
  }

  return (
    <View style={styles.app}>
      <StatusBar style="dark" />
      <RouteTransition routeKey={routeKey}>{content}</RouteTransition>
      {showFloatingMenu && <FloatingMenu active={activeTab} onSelect={selectTab} notificationCount={unreadNotifications} />}
      <Modal animationType="fade" transparent visible={notificationToast !== null}>
        <View pointerEvents="box-none" style={styles.notificationLayer}>
          <Pressable onPress={() => notificationToast && void openNotification(notificationToast)} style={styles.notificationToast}>
            <View style={styles.notificationIcon}><Ionicons color={colors.ink} name={notificationToast?.type === 'friend_request' ? 'person-add-outline' : notificationToast?.type === 'club_invite' ? 'people-outline' : notificationToast?.type === 'weekly_summary' ? 'calendar-outline' : 'color-palette-outline'} size={20} /></View>
            <View style={styles.notificationCopy}><Text style={styles.notificationTitle}>{notificationToast?.title}</Text><Text style={styles.notificationBody}>{notificationToast?.body}</Text></View>
          </Pressable>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.paper },
  app: { flex: 1, backgroundColor: colors.paper },
  route: { flex: 1 },
  notificationLayer: { flex: 1, justifyContent: 'flex-start', paddingHorizontal: 18, paddingTop: 70 },
  notificationToast: { minHeight: 72, padding: 14, borderRadius: 24, backgroundColor: colors.white, borderWidth: 1, borderColor: colors.line, flexDirection: 'row', alignItems: 'center', gap: 12, shadowColor: colors.ink, shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.14, shadowRadius: 18, elevation: 9 },
  notificationIcon: { width: 42, height: 42, borderRadius: 15, backgroundColor: colors.green, alignItems: 'center', justifyContent: 'center' },
  notificationCopy: { flex: 1, gap: 2 },
  notificationTitle: { color: colors.ink, fontSize: 14, fontWeight: '900' },
  notificationBody: { color: colors.muted, fontSize: 12, lineHeight: 16 },
  setup: { flex: 1, justifyContent: 'center', gap: 25 },
  mark: { flexDirection: 'row', gap: 5 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  setupCard: { gap: 16 },
  biometricLock: { flex: 1, justifyContent: 'center', gap: 24 },
  biometricIcon: { width: 82, height: 82, borderRadius: 28, backgroundColor: colors.lavender, alignItems: 'center', justifyContent: 'center' },
  biometricCopy: { gap: 8 },
  biometricEyebrow: { color: colors.muted, fontSize: 11, fontWeight: '900', letterSpacing: 1.2 },
  biometricError: { color: colors.danger, fontSize: 14, lineHeight: 20 },
  biometricActions: { gap: 8 },
  step: { color: colors.coral, fontSize: 11, fontWeight: '900', letterSpacing: 1.3 },
  code: { fontFamily: 'monospace', fontWeight: '700' },
  codeBlock: { fontFamily: 'monospace', fontSize: 12, lineHeight: 21, color: colors.cobalt, backgroundColor: colors.paper, padding: 12 },
});
