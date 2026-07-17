import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { Body, Button, Card, ErrorText, Eyebrow, Header, Screen, Title } from '@/components/ui';
import { getClub } from '@/lib/api';
import { colors } from '@/lib/theme';
import type { Challenge, Club, RankingRow } from '@/types/domain';

function countdown(date: string) {
  const milliseconds = Math.max(0, new Date(date).getTime() - Date.now());
  const hours = Math.floor(milliseconds / 3_600_000);
  const minutes = Math.floor((milliseconds % 3_600_000) / 60_000);
  return `${hours}h ${String(minutes).padStart(2, '0')}m`;
}

const statusLabel = { configuring: 'PROGRAMADO', active: 'EN JUEGO', voting: 'VOTACIÓN', closed: 'RESULTADOS' };

export function ClubScreen({
  clubId,
  userId,
  onBack,
  onChallenge,
  onNewChallenge,
}: {
  clubId: string;
  userId: string;
  onBack: () => void;
  onChallenge: (id: string) => void;
  onNewChallenge: () => void;
}) {
  const [club, setClub] = useState<Club | null>(null);
  const [challenge, setChallenge] = useState<Challenge | null>(null);
  const [ranking, setRanking] = useState<RankingRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    try {
      const data = await getClub(clubId);
      setClub(data.club);
      setChallenge(data.challenge);
      setRanking(data.ranking);
    } catch (caught) { setError((caught as Error).message); }
    setLoading(false);
  }

  useEffect(() => { void load(); }, [clubId]);

  if (loading || !club) return <Screen><Header title="CLUB" onBack={onBack} /><ActivityIndicator style={styles.loader} color={colors.coral} /></Screen>;

  return (
    <Screen>
      <Header title={club.name.toUpperCase()} onBack={onBack} />
      <View style={styles.heading}>
        <Eyebrow>Temporada actual</Eyebrow>
        <Title>{club.name}</Title>
        <Pressable><Text selectable style={styles.code}>INVITA CON {club.invite_code}</Text></Pressable>
      </View>
      <ErrorText message={error} />
      {challenge && challenge.status !== 'closed' ? (
        <Pressable onPress={() => onChallenge(challenge.id)} style={({ pressed }) => [styles.challenge, pressed && styles.pressed]}>
          <View style={[styles.colorBar, { backgroundColor: challenge.shared_color ?? colors.coral }]} />
          <View style={styles.challengeContent}>
            <View style={styles.statusRow}>
              <Text style={styles.status}>{statusLabel[challenge.status]}</Text>
              <Text style={styles.timer}>{challenge.status === 'active' ? countdown(challenge.ends_at) : 'Abrir →'}</Text>
            </View>
            <Text style={styles.challengeTitle}>{challenge.status === 'voting' ? 'Elige el mejor collage' : 'Encuentra este color'}</Text>
            <View style={[styles.swatch, { backgroundColor: challenge.shared_color ?? colors.line }]} />
          </View>
        </Pressable>
      ) : club.admin_id === userId ? (
        <Button label="Lanzar un nuevo reto" onPress={onNewChallenge} />
      ) : (
        <Card><Body muted>El admin todavía no ha lanzado un reto. Mientras tanto, afina el ojo.</Body></Card>
      )}
      {challenge?.status === 'closed' && <Button label="Ver último resultado" onPress={() => onChallenge(challenge.id)} variant="secondary" />}
      {challenge?.status === 'closed' && club.admin_id === userId && <Button label="Lanzar un nuevo reto" onPress={onNewChallenge} />}
      <View style={styles.rankingHeader}>
        <Eyebrow>Marcador</Eyebrow>
        <Text style={styles.rule}>1 voto = 1 punto</Text>
      </View>
      {ranking.length === 0 ? <Body muted>Aquí aparecerá el ranking al cerrar el primer reto.</Body> : ranking.map((row) => (
        <View key={row.user_id} style={styles.rankRow}>
          <Text style={styles.position}>{String(row.position).padStart(2, '0')}</Text>
          <Text style={styles.name}>{row.display_name}{row.user_id === userId ? ' (tú)' : ''}</Text>
          <Text style={styles.points}>{row.points} pt{row.points === 1 ? '' : 's'}</Text>
        </View>
      ))}
    </Screen>
  );
}

const styles = StyleSheet.create({
  loader: { marginTop: 100 },
  heading: { marginVertical: 20, gap: 6 },
  code: { color: colors.cobalt, fontSize: 12, fontWeight: '900', letterSpacing: 1.2, marginTop: 9 },
  challenge: { backgroundColor: colors.ink, minHeight: 220, flexDirection: 'row', marginBottom: 18 },
  colorBar: { width: 10 },
  challengeContent: { flex: 1, padding: 20, justifyContent: 'space-between' },
  statusRow: { flexDirection: 'row', justifyContent: 'space-between' },
  status: { color: colors.yellow, fontSize: 11, fontWeight: '900', letterSpacing: 1.6 },
  timer: { color: colors.white, fontWeight: '800' },
  challengeTitle: { color: colors.white, fontSize: 28, fontWeight: '900', maxWidth: 260 },
  swatch: { width: 44, height: 44, borderRadius: 22, borderWidth: 3, borderColor: colors.white },
  pressed: { opacity: 0.8 },
  rankingHeader: { marginTop: 38, paddingBottom: 8, borderBottomWidth: 2, borderBottomColor: colors.ink, flexDirection: 'row', justifyContent: 'space-between' },
  rule: { color: colors.muted, fontSize: 12 },
  rankRow: { minHeight: 60, flexDirection: 'row', alignItems: 'center', borderBottomWidth: 1, borderBottomColor: colors.line },
  position: { width: 42, color: colors.coral, fontWeight: '900' },
  name: { flex: 1, color: colors.ink, fontSize: 16, fontWeight: '800' },
  points: { color: colors.ink, fontWeight: '900' },
});
