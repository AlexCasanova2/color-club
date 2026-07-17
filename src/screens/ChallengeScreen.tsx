import { useEffect, useState } from 'react';
import * as ImagePicker from 'expo-image-picker';
import { ActivityIndicator, Alert, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { Body, Button, Card, ErrorText, Eyebrow, Header, Screen, Title } from '@/components/ui';
import { castVote, getChallenge, submitCollage, uploadPhoto } from '@/lib/api';
import { supabase } from '@/lib/supabase';
import { colors } from '@/lib/theme';
import type { Challenge, Participant, Vote } from '@/types/domain';

function remaining(date: string) {
  const ms = Math.max(0, new Date(date).getTime() - Date.now());
  const hours = Math.floor(ms / 3_600_000);
  const minutes = Math.floor((ms % 3_600_000) / 60_000);
  return `${hours}h ${String(minutes).padStart(2, '0')}m`;
}

function Collage({ participant }: { participant: Participant }) {
  return (
    <View style={styles.collage}>
      {Array.from({ length: 6 }, (_, index) => {
        const photo = participant.photos?.find((item) => item.slot_order === index + 1);
        return photo?.photo_url ? <Image key={index} source={{ uri: photo.photo_url }} style={styles.collagePhoto} /> : <View key={index} style={[styles.collagePhoto, styles.photoMissing]} />;
      })}
    </View>
  );
}

export function ChallengeScreen({ challengeId, userId, onBack }: { challengeId: string; userId: string; onBack: () => void }) {
  const [challenge, setChallenge] = useState<Challenge | null>(null);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [votes, setVotes] = useState<Vote[]>([]);
  const [votedId, setVotedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<number | 'submit' | 'vote' | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function load(silent = false) {
    if (!silent) setLoading(true);
    try {
      const data = await getChallenge(challengeId, userId);
      setChallenge(data.challenge);
      setParticipants(data.participants);
      setVotes(data.votes);
      setVotedId(data.votedParticipantId);
      setError(null);
    } catch (caught) { setError((caught as Error).message); }
    if (!silent) setLoading(false);
  }

  useEffect(() => {
    void load();
    const channel = supabase.channel(`challenge-${challengeId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'challenge_participants', filter: `challenge_id=eq.${challengeId}` }, () => void load(true))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'challenges', filter: `id=eq.${challengeId}` }, () => void load(true))
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [challengeId]);

  const me = participants.find((participant) => participant.user_id === userId);

  async function choosePhoto(slot: number, camera: boolean) {
    const result = camera
      ? await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.8, allowsEditing: true, aspect: [1, 1] })
      : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.8, allowsEditing: true, aspect: [1, 1] });
    if (result.canceled || !me) return;
    setBusy(slot);
    setError(null);
    try { await uploadPhoto(me.id, slot, result.assets[0]!.uri); await load(true); }
    catch (caught) { setError((caught as Error).message); }
    setBusy(null);
  }

  function photoAction(slot: number) {
    Alert.alert('Añadir foto', '¿De dónde quieres sacar este color?', [
      { text: 'Cámara', onPress: () => void choosePhoto(slot, true) },
      { text: 'Galería', onPress: () => void choosePhoto(slot, false) },
      { text: 'Cancelar', style: 'cancel' },
    ]);
  }

  async function finalize() {
    if (!me) return;
    Alert.alert('¿Collage definitivo?', 'Después de enviarlo no podrás cambiar las fotos.', [
      { text: 'Seguir editando', style: 'cancel' },
      { text: 'Enviar', onPress: async () => {
        setBusy('submit');
        try { await submitCollage(me.id); await load(true); }
        catch (caught) { setError((caught as Error).message); }
        setBusy(null);
      } },
    ]);
  }

  async function vote(participantId: string) {
    setBusy('vote');
    setError(null);
    try { await castVote(challengeId, participantId, userId); setVotedId(participantId); await load(true); }
    catch (caught) { setError((caught as Error).message); }
    setBusy(null);
  }

  if (loading || !challenge || !me) return <Screen><Header title="Reto" onBack={onBack} /><ActivityIndicator style={styles.loader} color={colors.coral} /><ErrorText message={error} /></Screen>;

  const completed = me.photos?.length ?? 0;
  const submitted = participants.filter((participant) => participant.status === 'submitted').length;

  if (challenge.status === 'active' && me.status === 'pending') {
    return (
      <Screen>
        <Header title="Tu reto" onBack={onBack} />
        <View style={styles.challengeHeading}>
          <View style={[styles.bigSwatch, { backgroundColor: challenge.shared_color ?? colors.line }]} />
          <View style={styles.headingText}><Eyebrow>Quedan {remaining(challenge.ends_at)}</Eyebrow><Title size="medium">Caza este color</Title></View>
        </View>
        <Body muted>Busca seis momentos donde domine el color. No hace falta que sean perfectos; sí que sean tuyos.</Body>
        <View style={styles.editGrid}>
          {Array.from({ length: 6 }, (_, index) => {
            const slot = index + 1;
            const photo = me.photos?.find((item) => item.slot_order === slot);
            return (
              <Pressable key={slot} onPress={() => photoAction(slot)} style={styles.editSlot}>
                {photo?.photo_url ? <Image source={{ uri: photo.photo_url }} style={styles.editImage} /> : <Text style={styles.plus}>+</Text>}
                {busy === slot && <View style={styles.imageLoader}><ActivityIndicator color={colors.white} /></View>}
                <Text style={styles.slotNumber}>{String(slot).padStart(2, '0')}</Text>
              </Pressable>
            );
          })}
        </View>
        <Text style={styles.progress}>{completed} de 6 fotos listas</Text>
        <ErrorText message={error} />
        <Button label="Enviar collage definitivo" onPress={finalize} disabled={completed !== 6} loading={busy === 'submit'} />
      </Screen>
    );
  }

  if (challenge.status === 'active' || challenge.status === 'configuring') {
    return (
      <Screen>
        <Header title="Esperando" onBack={onBack} />
        <View style={styles.centerHero}><Eyebrow>Quedan {remaining(challenge.ends_at)}</Eyebrow><Title>Ya está.</Title><Body muted>Tu collage está cerrado. Ahora toca esperar al resto del club.</Body></View>
        <Text style={styles.counter}>{submitted}/{participants.length}</Text>
        <Text style={styles.counterLabel}>collages enviados</Text>
        <View style={styles.people}>
          {participants.map((participant) => (
            <View key={participant.id} style={styles.person}>
              <View style={[styles.statusDot, participant.status === 'submitted' && styles.statusDone]} />
              <Text style={styles.personName}>{participant.profiles.display_name}{participant.user_id === userId ? ' (tú)' : ''}</Text>
              <Text style={styles.personStatus}>{participant.status === 'submitted' ? 'listo' : 'buscando'}</Text>
            </View>
          ))}
        </View>
      </Screen>
    );
  }

  if (challenge.status === 'voting') {
    const candidates = participants.filter((participant) => participant.user_id !== userId);
    return (
      <Screen>
        <Header title="Votación" onBack={onBack} />
        <View style={styles.heading}><Eyebrow>Un voto. Sin marcha atrás.</Eyebrow><Title>Tu favorito</Title><Body muted>Elige el collage que mejor captura el color del reto.</Body></View>
        {me.status === 'disqualified' && <Card style={styles.notice}><Body>No completaste el reto, así que esta vez no puedes votar.</Body></Card>}
        {votedId && <Card style={styles.notice}><Body>Voto enviado. El resultado aparecerá cuando cierre la votación.</Body></Card>}
        <View style={styles.candidates}>
          {candidates.map((participant) => (
            <Card key={participant.id} style={participant.status === 'disqualified' ? styles.disqualified : undefined}>
              <View style={styles.candidateHeader}><Text style={styles.candidateName}>{participant.profiles.display_name}</Text><Text style={styles.candidateState}>{participant.status === 'disqualified' ? 'No completó' : ''}</Text></View>
              {participant.status === 'submitted' && <Collage participant={participant} />}
              {participant.status === 'submitted' && !votedId && me.status === 'submitted' && <Button label="Este es mi voto" onPress={() => vote(participant.id)} loading={busy === 'vote'} />}
              {votedId === participant.id && <Text style={styles.yourVote}>Tu voto</Text>}
            </Card>
          ))}
        </View>
        <ErrorText message={error} />
      </Screen>
    );
  }

  const ordered = participants.map((participant) => ({
    ...participant,
    score: votes.filter((voteItem) => voteItem.voted_participant_id === participant.id).length,
  })).sort((a, b) => b.score - a.score);
  let previousScore: number | null = null;
  let previousPosition = 0;
  return (
    <Screen>
      <Header title="Resultados" onBack={onBack} />
      <View style={styles.heading}><Eyebrow>Reto cerrado</Eyebrow><Title>El veredicto</Title><Body muted>Los votos están a la vista. Los empates comparten posición.</Body></View>
      <View style={styles.results}>
        {ordered.map((participant, index) => {
          const position = participant.score === previousScore ? previousPosition : index + 1;
          previousScore = participant.score;
          previousPosition = position;
          const voterNames = votes.filter((voteItem) => voteItem.voted_participant_id === participant.id).map((voteItem) => participants.find((item) => item.user_id === voteItem.voter_id)?.profiles.display_name).filter(Boolean);
          return (
            <Card key={participant.id} style={participant.status === 'disqualified' ? styles.disqualified : undefined}>
              <View style={styles.resultHeader}><Text style={styles.resultPosition}>{participant.status === 'disqualified' ? '—' : `#${position}`}</Text><View style={styles.resultIdentity}><Text style={styles.candidateName}>{participant.profiles.display_name}</Text><Text style={styles.voteCount}>{participant.status === 'disqualified' ? 'No completó' : `${participant.score} voto${participant.score === 1 ? '' : 's'}`}</Text></View></View>
              {participant.status === 'submitted' && <Collage participant={participant} />}
              {participant.status === 'submitted' && <Text style={styles.voters}>{voterNames.length ? `Votaron: ${voterNames.join(', ')}` : 'Nadie votó este collage'}</Text>}
            </Card>
          );
        })}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  loader: { marginTop: 100 },
  heading: { marginVertical: 24, gap: 8 },
  challengeHeading: { flexDirection: 'row', alignItems: 'center', gap: 18, marginVertical: 26 },
  headingText: { flex: 1 },
  bigSwatch: { width: 68, height: 68, borderRadius: 34 },
  editGrid: { flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -4, marginVertical: 26 },
  editSlot: { width: '33.333%', aspectRatio: 1, padding: 4, backgroundColor: colors.line, borderWidth: 4, borderColor: colors.paper, borderRadius: 10, overflow: 'hidden', justifyContent: 'center', alignItems: 'center' },
  editImage: { position: 'absolute', inset: 4 },
  plus: { color: colors.muted, fontSize: 34, fontWeight: '300' },
  slotNumber: { position: 'absolute', left: 10, bottom: 8, color: colors.white, backgroundColor: '#191918BB', borderRadius: 4, paddingHorizontal: 5, paddingVertical: 2, fontSize: 10, fontWeight: '600' },
  imageLoader: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, backgroundColor: '#00000066', alignItems: 'center', justifyContent: 'center' },
  progress: { textAlign: 'center', color: colors.muted, fontSize: 13, fontWeight: '600', marginBottom: 16 },
  centerHero: { alignItems: 'center', gap: 12, marginTop: 55 },
  counter: { textAlign: 'center', color: colors.ink, fontSize: 64, fontWeight: '700', letterSpacing: -2, marginTop: 40 },
  counterLabel: { textAlign: 'center', color: colors.muted, fontSize: 13, fontWeight: '500' },
  people: { marginTop: 35, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, borderRadius: 16, paddingHorizontal: 16 },
  person: { minHeight: 58, flexDirection: 'row', alignItems: 'center', borderBottomWidth: 1, borderBottomColor: colors.line, gap: 12 },
  statusDot: { width: 11, height: 11, borderRadius: 6, borderWidth: 2, borderColor: colors.muted },
  statusDone: { backgroundColor: colors.green, borderColor: colors.green },
  personName: { flex: 1, color: colors.ink, fontWeight: '600' },
  personStatus: { color: colors.muted, fontSize: 12 },
  notice: { marginBottom: 16, borderLeftWidth: 3, borderLeftColor: colors.yellow },
  candidates: { gap: 18 },
  candidateHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 14 },
  candidateName: { color: colors.ink, fontSize: 18, fontWeight: '600' },
  candidateState: { color: colors.danger, fontSize: 12, fontWeight: '600' },
  collage: { flexDirection: 'row', flexWrap: 'wrap', marginBottom: 15 },
  collagePhoto: { width: '33.333%', aspectRatio: 1, borderWidth: 1, borderColor: colors.surface },
  photoMissing: { backgroundColor: colors.line },
  disqualified: { opacity: 0.52 },
  yourVote: { color: colors.green, textAlign: 'center', fontWeight: '600', marginTop: 5 },
  results: { gap: 16 },
  resultHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 15 },
  resultPosition: { color: colors.muted, fontSize: 30, fontWeight: '600', width: 65 },
  resultIdentity: { flex: 1 },
  voteCount: { color: colors.muted, marginTop: 3 },
  voters: { color: colors.muted, fontSize: 12, lineHeight: 18 },
});
