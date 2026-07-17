import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import type { Session } from '@supabase/supabase-js';
import { StatusBar } from 'expo-status-bar';
import { Body, Card, Screen, Title } from '@/components/ui';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';
import { colors } from '@/lib/theme';
import { AuthScreen } from '@/screens/AuthScreen';
import { ChallengeScreen } from '@/screens/ChallengeScreen';
import { ClubScreen } from '@/screens/ClubScreen';
import { HomeScreen } from '@/screens/HomeScreen';
import { NewChallengeScreen } from '@/screens/NewChallengeScreen';

type Route =
  | { name: 'home' }
  | { name: 'club'; clubId: string }
  | { name: 'new-challenge'; clubId: string }
  | { name: 'challenge'; clubId: string; challengeId: string };

function SetupScreen() {
  return (
    <Screen>
      <View style={styles.setup}>
        <View style={styles.mark}><View style={[styles.dot, { backgroundColor: colors.coral }]} /><View style={[styles.dot, { backgroundColor: colors.yellow }]} /><View style={[styles.dot, { backgroundColor: colors.cobalt }]} /></View>
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

export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [checking, setChecking] = useState(true);
  const [route, setRoute] = useState<Route>({ name: 'home' });

  useEffect(() => {
    if (!isSupabaseConfigured) { setChecking(false); return; }
    void supabase.auth.getSession().then(({ data }) => { setSession(data.session); setChecking(false); });
    const { data } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      if (!nextSession) setRoute({ name: 'home' });
    });
    return () => data.subscription.unsubscribe();
  }, []);

  if (!isSupabaseConfigured) return <><StatusBar style="dark" /><SetupScreen /></>;
  if (checking) return <View style={styles.loading}><StatusBar style="dark" /><ActivityIndicator color={colors.coral} /></View>;
  if (!session) return <><StatusBar style="dark" /><AuthScreen /></>;

  let content;
  if (route.name === 'home') {
    content = <HomeScreen onOpenClub={(clubId) => setRoute({ name: 'club', clubId })} />;
  } else if (route.name === 'club') {
    content = (
      <ClubScreen
        clubId={route.clubId}
        userId={session.user.id}
        onBack={() => setRoute({ name: 'home' })}
        onChallenge={(challengeId) => setRoute({ name: 'challenge', clubId: route.clubId, challengeId })}
        onNewChallenge={() => setRoute({ name: 'new-challenge', clubId: route.clubId })}
      />
    );
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

  return <><StatusBar style="dark" />{content}</>;
}

const styles = StyleSheet.create({
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.paper },
  setup: { flex: 1, justifyContent: 'center', gap: 25 },
  mark: { flexDirection: 'row', gap: 7 },
  dot: { width: 22, height: 22, borderRadius: 11 },
  setupCard: { gap: 16 },
  step: { color: colors.coral, fontSize: 11, fontWeight: '900', letterSpacing: 1.3 },
  code: { fontFamily: 'monospace', fontWeight: '700' },
  codeBlock: { fontFamily: 'monospace', fontSize: 12, lineHeight: 21, color: colors.cobalt, backgroundColor: colors.paper, padding: 12 },
});
