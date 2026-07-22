import { useEffect, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import { ActivityIndicator, Alert, Image, Modal, PanResponder, Pressable, ScrollView, StyleSheet, Text, View, type ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Body, Button, Card, ErrorText, Eyebrow, Header, Screen, Title } from '@/components/ui';
import { advanceChallenge, castVote, deletePhoto, getChallenge, submitCollage, uploadPhoto } from '@/lib/api';
import { supabase } from '@/lib/supabase';
import { colors } from '@/lib/theme';
import type { Challenge, Participant, Vote } from '@/types/domain';

const revealColors = ['#E84A3C', '#3157D5', '#F4C542', '#3A8D67', '#E75A9D', '#F27C38', '#7450A8', '#E9E6DF', '#30B7C2', '#9C6ADE', '#6B4F3A', '#111217'];

function remaining(date: string) {
  const ms = Math.max(0, new Date(date).getTime() - Date.now());
  const hours = Math.floor(ms / 3_600_000);
  const minutes = Math.floor((ms % 3_600_000) / 60_000);
  const seconds = Math.floor((ms % 60_000) / 1000);
  return `${hours}h ${String(minutes).padStart(2, '0')}m ${String(seconds).padStart(2, '0')}s`;
}

function readableTextColor(hex: string) {
  const clean = hex.replace('#', '');
  const red = parseInt(clean.slice(0, 2), 16);
  const green = parseInt(clean.slice(2, 4), 16);
  const blue = parseInt(clean.slice(4, 6), 16);
  return (red * 299 + green * 587 + blue * 114) / 1000 > 150 ? colors.ink : colors.white;
}

function collageLayout(photoCount: number) {
  if (photoCount === 2) return { aspectRatio: 9 / 16, columns: 1, rows: 2, slotAspectRatio: 9 / 8 };
  if (photoCount === 4) return { aspectRatio: 9 / 16, columns: 2, rows: 2, slotAspectRatio: 9 / 16 };
  if (photoCount === 6) return { aspectRatio: 9 / 16, columns: 2, rows: 3, slotAspectRatio: 27 / 32 };
  const rows = Math.ceil(photoCount / 2);
  const aspectRatio = 1.44 / rows;
  return { aspectRatio, columns: 2, rows, slotAspectRatio: aspectRatio * rows / 2 };
}

function Collage({ participant, photoCount = 6, showSlotNumbers = false, style }: { participant: Participant; photoCount?: number; showSlotNumbers?: boolean; style?: ViewStyle }) {
  const layout = collageLayout(photoCount);
  return (
    <View style={[styles.collage, { aspectRatio: layout.aspectRatio }, style]}>
      {Array.from({ length: photoCount }, (_, index) => {
        const photo = participant.photos?.find((item) => item.slot_order === index + 1);
        const slotStyle = { width: `${100 / layout.columns}%` as `${number}%`, height: `${100 / layout.rows}%` as `${number}%` };
        return photo?.photo_url ? <Image key={index} resizeMode="cover" source={{ uri: photo.photo_url }} style={[styles.collagePhoto, slotStyle]} /> : (
          <View key={index} style={[styles.collagePhoto, slotStyle, styles.photoMissing]}>{showSlotNumbers && <Text style={styles.previewSlot}>{index + 1}</Text>}</View>
        );
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
  const [previewOpen, setPreviewOpen] = useState(false);
  const [selectedSlot, setSelectedSlot] = useState<number | null>(null);
  const [revealVisible, setRevealVisible] = useState(false);
  const [revealStopped, setRevealStopped] = useState(false);
  const [wheelIndex, setWheelIndex] = useState(0);
  const [cropSlot, setCropSlot] = useState<number | null>(null);
  const [cropImageSize, setCropImageSize] = useState({ width: 0, height: 0 });
  const [cropFrameSize, setCropFrameSize] = useState({ width: 0, height: 0 });
  const [cropOffset, setCropOffset] = useState({ x: 0, y: 0 });
  const [viewingParticipant, setViewingParticipant] = useState<Participant | null>(null);
  const [clockTick, setClockTick] = useState(Date.now());
  const cropStart = useRef({ x: 0, y: 0 });
  const advancedDeadline = useRef<string | null>(null);

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
    void advanceChallenge(challenge.id).finally(() => load(true));
  }, [challenge?.id, challenge?.status, challenge?.ends_at, challenge?.voting_ends_at, clockTick]);

  const me = participants.find((participant) => participant.user_id === userId);
  const targetColor = challenge?.mode === 'individual_random' ? me?.assigned_color : challenge?.shared_color;

  useEffect(() => {
    if (!challenge || !me || !targetColor || challenge.color_selection_mode === 'manual') return;
    let interval: ReturnType<typeof setInterval> | undefined;
    let timeout: ReturnType<typeof setTimeout> | undefined;
    const revealKey = `color-reveal:${challenge.id}:${userId}`;
    AsyncStorage.getItem(revealKey).then((seen) => {
      if (seen) return;
      setRevealStopped(false);
      setRevealVisible(true);
      interval = setInterval(() => setWheelIndex((index) => (index + 1) % revealColors.length), 72);
      timeout = setTimeout(() => {
        if (interval) clearInterval(interval);
        setWheelIndex(Math.max(0, revealColors.findIndex((item) => item.toLowerCase() === targetColor.toLowerCase())));
        setRevealStopped(true);
      }, 2300);
    }).catch(() => undefined);
    return () => {
      if (interval) clearInterval(interval);
      if (timeout) clearTimeout(timeout);
    };
  }, [challenge?.id, challenge?.color_selection_mode, me?.id, targetColor, userId]);

  async function acceptReveal() {
    if (!challenge) return;
    await AsyncStorage.setItem(`color-reveal:${challenge.id}:${userId}`, 'seen');
    setRevealVisible(false);
  }

  async function choosePhoto(slot: number, camera: boolean) {
    if (!challenge || !me || me.status !== 'pending' || challenge.status !== 'active' || new Date(challenge.ends_at).getTime() <= Date.now()) {
      Alert.alert('Se acabó el tiempo', 'No has llegado a tiempo para añadir esta foto. Tu collage está cerrado y el reto pasa a la siguiente fase.');
      if (challenge) await advanceChallenge(challenge.id).catch(() => undefined);
      await load(true);
      return;
    }
    if (camera) {
      const permission = await ImagePicker.requestCameraPermissionsAsync();
      if (!permission.granted) {
        Alert.alert('Permiso de cámara', 'Necesitamos acceso a la cámara para hacer fotos del reto. Puedes activarlo en Ajustes.');
        return;
      }
    }
    const result = camera
      ? await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.9, allowsEditing: false })
      : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.9, allowsEditing: false });
    if (result.canceled || !me) return;
    if (!challenge || me.status !== 'pending' || challenge.status !== 'active' || new Date(challenge.ends_at).getTime() <= Date.now()) {
      Alert.alert('Se acabó el tiempo', 'No has llegado a tiempo para añadir esta foto. Tu collage está cerrado y el reto pasa a la siguiente fase.');
      if (challenge) await advanceChallenge(challenge.id).catch(() => undefined);
      await load(true);
      return;
    }
    setBusy(slot);
    setError(null);
    try { await uploadPhoto(me.id, slot, result.assets[0]!.uri); await load(true); }
    catch (caught) {
      const message = (caught as Error).message;
      if (message.startsWith('No has llegado a tiempo')) {
        Alert.alert('Se acabó el tiempo', 'No has llegado a tiempo para añadir esta foto. Tu collage está cerrado y el reto pasa a la siguiente fase.');
        if (challenge) await advanceChallenge(challenge.id).catch(() => undefined);
        await load(true);
      } else {
        setError(message);
      }
    }
    setBusy(null);
    setSelectedSlot(null);
  }

  async function removeSelectedPhoto() {
    if (!me || selectedSlot === null) return;
    const photo = me.photos?.find((item) => item.slot_order === selectedSlot);
    if (!photo) return;
    setBusy(selectedSlot);
    setError(null);
    try { await deletePhoto(photo.id, photo.storage_path); await load(true); setSelectedSlot(null); }
    catch (caught) { setError((caught as Error).message); }
    setBusy(null);
  }

  function clampCropOffset(next: { x: number; y: number }) {
    if (!cropFrameSize.width || !cropImageSize.width) return next;
    const scale = Math.max(cropFrameSize.width / cropImageSize.width, cropFrameSize.height / cropImageSize.height);
    const scaledWidth = cropImageSize.width * scale;
    const scaledHeight = cropImageSize.height * scale;
    const maxX = Math.max(0, (scaledWidth - cropFrameSize.width) / 2);
    const maxY = Math.max(0, (scaledHeight - cropFrameSize.height) / 2);
    return {
      x: Math.max(-maxX, Math.min(maxX, next.x)),
      y: Math.max(-maxY, Math.min(maxY, next.y)),
    };
  }

  const cropPanResponder = PanResponder.create({
    onMoveShouldSetPanResponder: () => true,
    onPanResponderGrant: () => { cropStart.current = cropOffset; },
    onPanResponderMove: (_event, gesture) => {
      setCropOffset(clampCropOffset({ x: cropStart.current.x + gesture.dx, y: cropStart.current.y + gesture.dy }));
    },
  });

  function openCropEditor(slot: number) {
    const photo = me?.photos?.find((item) => item.slot_order === slot);
    if (!photo?.photo_url) return;
    setCropSlot(slot);
    setCropOffset({ x: 0, y: 0 });
    Image.getSize(photo.photo_url, (width, height) => setCropImageSize({ width, height }), () => setCropImageSize({ width: 0, height: 0 }));
  }

  async function saveCrop() {
    if (!me || cropSlot === null || !cropImageSize.width || !cropFrameSize.width) return;
    const photo = me.photos?.find((item) => item.slot_order === cropSlot);
    if (!photo) return;
    const scale = Math.max(cropFrameSize.width / cropImageSize.width, cropFrameSize.height / cropImageSize.height);
    const displayedWidth = cropImageSize.width * scale;
    const displayedHeight = cropImageSize.height * scale;
    const imageLeft = (cropFrameSize.width - displayedWidth) / 2 + cropOffset.x;
    const imageTop = (cropFrameSize.height - displayedHeight) / 2 + cropOffset.y;
    const crop = {
      originX: Math.max(0, Math.round(-imageLeft / scale)),
      originY: Math.max(0, Math.round(-imageTop / scale)),
      width: Math.min(cropImageSize.width, Math.round(cropFrameSize.width / scale)),
      height: Math.min(cropImageSize.height, Math.round(cropFrameSize.height / scale)),
    };
    setBusy(cropSlot);
    try {
      const result = await ImageManipulator.manipulateAsync(photo.photo_url, [{ crop }], { compress: 0.9, format: ImageManipulator.SaveFormat.JPEG });
      await uploadPhoto(me.id, cropSlot, result.uri);
      await load(true);
      setCropSlot(null);
      setSelectedSlot(null);
    } catch (caught) { setError((caught as Error).message); }
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
  const waitingParticipants = [...participants].sort((first, second) => {
    if (first.user_id === userId) return -1;
    if (second.user_id === userId) return 1;
    if (first.status !== second.status) return first.status === 'submitted' ? -1 : 1;
    return first.profiles.display_name.localeCompare(second.profiles.display_name);
  });
  const submissionProgress = participants.length ? `${(submitted / participants.length) * 100}%` as `${number}%` : '0%';
  const photoCount = challenge.photo_count ?? 6;
  const layout = collageLayout(photoCount);
  const revealColor = revealStopped && targetColor ? targetColor : revealColors[wheelIndex] ?? colors.ink;
  const revealTextColor = readableTextColor(revealColor);
  const revealTitle = revealStopped ? 'Este es tu color' : 'Asignando color...';

  const revealModal = (
    <Modal animationType="fade" transparent visible={revealVisible} onRequestClose={() => undefined}>
      <View style={[styles.revealRoot, revealStopped && { backgroundColor: revealColor }]}>
        {!revealStopped ? (
          <View style={styles.revealCard}>
            <Text style={styles.revealKicker}>{challenge.color_selection_mode === 'individual_random' ? 'Color único' : 'Color aleatorio'}</Text>
            <Text style={styles.revealTitle}>{revealTitle}</Text>
            <View style={styles.slotMachine}>
              <View style={[styles.slotColorPrevious, { backgroundColor: revealColors[(wheelIndex + revealColors.length - 1) % revealColors.length] }]} />
              <View style={[styles.slotColor, { backgroundColor: revealColor }]} />
              <View style={[styles.slotColorNext, { backgroundColor: revealColors[(wheelIndex + 1) % revealColors.length] }]} />
            </View>
            <Text style={styles.revealHex}>••••••</Text>
            <Text style={styles.revealBody}>El torno está girando. En un segundo se parará en tu color.</Text>
            <Text style={styles.revealCountdownNote}>La cuenta atrás ya empezó al lanzar el reto.</Text>
          </View>
        ) : (
          <View style={styles.finalReveal}>
            <View style={styles.finalRevealTop}>
              <Text style={[styles.finalRevealKicker, { color: revealTextColor }]}>{challenge.color_selection_mode === 'individual_random' ? 'Tu color único' : 'Color del reto'}</Text>
              <Text style={[styles.finalRevealTitle, { color: revealTextColor }]}>Este es tu color</Text>
            </View>
            <View style={[styles.finalRevealSwatch, { borderColor: revealTextColor }]} />
            <Text style={[styles.finalRevealHex, { color: revealTextColor }]}>{targetColor?.toUpperCase()}</Text>
            <View style={[styles.finalRevealInfo, { backgroundColor: revealTextColor === colors.white ? '#00000033' : '#FFFFFF66' }]}>
              <Text style={[styles.finalRevealTime, { color: revealTextColor }]}>Quedan {remaining(challenge.ends_at)}</Text>
              <Text style={[styles.finalRevealCopy, { color: revealTextColor }]}>La cuenta atrás empezó cuando se lanzó el reto, no cuando aceptas este color.</Text>
            </View>
            <Pressable onPress={acceptReveal} style={({ pressed }) => [styles.finalRevealButton, { backgroundColor: revealTextColor }, pressed && styles.finalRevealButtonPressed]}>
              <Text style={[styles.finalRevealButtonText, { color: revealTextColor === colors.white ? colors.ink : colors.white }]}>Empezar a cazar</Text>
            </Pressable>
          </View>
        )}
      </View>
    </Modal>
  );

  if (challenge.status === 'active' && me.status === 'pending') {
    return (
      <Screen>
        <Header title="Tu reto" onBack={onBack} />
        {revealModal}
        <View style={styles.challengeHeading}>
          <View style={[styles.bigSwatch, { backgroundColor: targetColor ?? colors.line }]} />
          <View style={styles.headingText}><Eyebrow>Quedan {remaining(challenge.ends_at)}</Eyebrow><Title size="medium">Caza este color</Title></View>
        </View>
        <Body muted>Busca {photoCount} momentos donde domine tu color. No hace falta que sean perfectos; sí que sean tuyos.</Body>
        <View style={[styles.editGrid, { aspectRatio: layout.aspectRatio }]}>
          {Array.from({ length: photoCount }, (_, index) => {
            const slot = index + 1;
            const photo = me.photos?.find((item) => item.slot_order === slot);
            return (
              <Pressable key={slot} onPress={() => photo ? setSelectedSlot(slot) : photoAction(slot)} style={({ pressed }) => [styles.editSlot, { width: `${100 / layout.columns}%`, height: `${100 / layout.rows}%` }, pressed && styles.pressedSlot]}>
                {photo?.photo_url ? <Image resizeMode="cover" source={{ uri: photo.photo_url }} style={styles.editImage} /> : (
                  <View style={styles.emptySlotContent}>
                    <Ionicons color={colors.ink} name="camera-outline" size={28} />
                    <Text style={styles.emptySlotText}>Añadir</Text>
                  </View>
                )}
                {busy === slot && <View style={styles.imageLoader}><ActivityIndicator color={colors.white} /></View>}
                <Text style={[styles.slotNumber, photo?.photo_url && styles.slotNumberFilled]}>{slot}</Text>
              </Pressable>
            );
          })}
        </View>
        <View style={styles.progressWrap}>
          {Array.from({ length: photoCount }, (_, index) => <View key={index} style={[styles.progressDot, index < completed && styles.progressDotDone]} />)}
        </View>
        <Text style={styles.progress}>{completed} de {photoCount} fotos listas</Text>
        <ErrorText message={error} />
        <View style={styles.actionStack}>
          <Button label="Ver collage completo" onPress={() => setPreviewOpen(true)} variant="secondary" disabled={completed === 0} />
          <Button label="Enviar collage definitivo" onPress={finalize} disabled={completed !== photoCount} loading={busy === 'submit'} />
        </View>
        <Modal animationType="fade" transparent visible={previewOpen} onRequestClose={() => setPreviewOpen(false)}>
          <View style={styles.previewRoot}>
            <View style={styles.previewHeader}>
              <View><Text style={styles.previewKicker}>ASÍ LO VERÁ EL CLUB</Text><Text style={styles.previewTitle}>Tu collage</Text></View>
              <Pressable accessibilityRole="button" accessibilityLabel="Cerrar previsualización" onPress={() => setPreviewOpen(false)} style={styles.previewClose}>
                <Ionicons color={colors.white} name="close" size={22} />
              </Pressable>
            </View>
            <ScrollView contentContainerStyle={styles.previewContent} showsVerticalScrollIndicator={false}>
              <View style={styles.previewStage}>
                <View style={styles.previewHalo} />
                <View style={styles.previewFrame}>
                  <View style={styles.previewChrome}><View style={styles.previewChromeDot} /><View style={[styles.previewChromeDot, styles.previewChromeDotMuted]} /><View style={[styles.previewChromeDot, styles.previewChromeDotDark]} /></View>
                  <Collage participant={me} photoCount={photoCount} showSlotNumbers style={styles.previewCollage} />
                  <View style={styles.previewBadge}><Ionicons color={colors.ink} name="sparkles-outline" size={15} /><Text style={styles.previewBadgeText}>Final</Text></View>
                </View>
              </View>
              <View style={styles.previewFooter}>
                <View style={styles.previewChip}><Ionicons color={colors.green} name="images-outline" size={17} /><Text style={styles.previewChipText}>{completed}/{photoCount} fotos</Text></View>
                <View style={styles.previewChip}><Ionicons color={colors.green} name="eye-outline" size={17} /><Text style={styles.previewChipText}>Vista del club</Text></View>
              </View>
              <Text style={styles.previewHint}>Esta composición será idéntica en la votación y en los resultados.</Text>
            </ScrollView>
          </View>
        </Modal>
        <Modal animationType="fade" transparent visible={selectedSlot !== null} onRequestClose={() => setSelectedSlot(null)}>
          <View style={styles.photoDetailRoot}>
            <Pressable style={StyleSheet.absoluteFill} onPress={() => setSelectedSlot(null)} />
            {selectedSlot !== null && (() => {
              const photo = me.photos?.find((item) => item.slot_order === selectedSlot);
              return photo ? (
                <View style={styles.photoDetailCard}>
                  <Image source={{ uri: photo.photo_url }} style={styles.photoDetailImage} />
                  <View style={styles.photoDetailActions}>
                    <Button label="Cambiar encuadre" onPress={() => openCropEditor(selectedSlot)} variant="secondary" />
                    <Button label="Nueva foto" onPress={() => photoAction(selectedSlot)} variant="secondary" />
                    <Button label="Borrar foto" onPress={removeSelectedPhoto} loading={busy === selectedSlot} variant="danger" />
                  </View>
                  <Button label="Cerrar" onPress={() => setSelectedSlot(null)} variant="quiet" />
                </View>
              ) : null;
            })()}
          </View>
        </Modal>
        <Modal animationType="fade" transparent visible={cropSlot !== null} onRequestClose={() => setCropSlot(null)}>
          <View style={styles.cropRoot}>
            <View style={styles.cropHeader}>
              <Text style={styles.previewTitle}>Ajusta el encuadre</Text>
              <Pressable onPress={() => setCropSlot(null)} style={styles.previewClose}><Ionicons color={colors.white} name="close" size={22} /></Pressable>
            </View>
            {cropSlot !== null && (() => {
              const photo = me.photos?.find((item) => item.slot_order === cropSlot);
              const scale = cropFrameSize.width && cropImageSize.width ? Math.max(cropFrameSize.width / cropImageSize.width, cropFrameSize.height / cropImageSize.height) : 1;
              const imageStyle = cropImageSize.width ? {
                width: cropImageSize.width * scale,
                height: cropImageSize.height * scale,
                transform: [{ translateX: cropOffset.x }, { translateY: cropOffset.y }],
              } : undefined;
              return photo ? (
                <View style={styles.cropContent}>
                  <View onLayout={(event) => setCropFrameSize({ width: event.nativeEvent.layout.width, height: event.nativeEvent.layout.height })} style={[styles.cropFrame, { aspectRatio: layout.slotAspectRatio }]} {...cropPanResponder.panHandlers}>
                    <Image source={{ uri: photo.photo_url }} style={[styles.cropImage, imageStyle]} />
                    <View pointerEvents="none" style={styles.cropGuide} />
                  </View>
                  <Text style={styles.cropHint}>Arrastra la foto para decidir qué parte se verá en el collage.</Text>
                  <View style={styles.actionStack}>
                    <Button label="Guardar encuadre" onPress={saveCrop} loading={busy === cropSlot} />
                    <Button label="Cancelar" onPress={() => setCropSlot(null)} variant="quiet" />
                  </View>
                </View>
              ) : null;
            })()}
          </View>
        </Modal>
      </Screen>
    );
  }

  if (challenge.status === 'active' || challenge.status === 'configuring') {
    return (
      <Screen>
        <Header title="Esperando" onBack={onBack} />
        {revealModal}
        <View style={styles.waitingHero}>
          <View style={styles.waitingHeroTop}>
            <View style={styles.waitingDoneIcon}><Ionicons color={colors.ink} name="checkmark" size={22} /></View>
            <Text style={styles.timeBadge}>{remaining(challenge.ends_at)}</Text>
          </View>
          <View style={styles.waitingHeroCopy}>
            <Text style={styles.waitingKicker}>COLLAGE ENVIADO</Text>
            <Title size="medium">Ya está en juego</Title>
            <Body>Tu collage está cerrado. La votación empezará cuando termine el tiempo.</Body>
          </View>
        </View>

        <Card style={styles.waitingProgressCard}>
          <View style={styles.waitingProgressHeader}>
            <View>
              <Text style={styles.waitingSectionLabel}>PROGRESO DEL CLUB</Text>
              <Text style={styles.waitingProgressValue}>{submitted}<Text style={styles.waitingProgressTotal}> / {participants.length}</Text></Text>
            </View>
            <Text style={styles.waitingProgressCaption}>{participants.length - submitted === 0 ? 'Todo listo' : `${participants.length - submitted} por enviar`}</Text>
          </View>
          <View style={styles.waitingProgressTrack}><View style={[styles.waitingProgressFill, { width: submissionProgress }]} /></View>
        </Card>

        <Card style={styles.participantsCard}>
          <View style={styles.participantsHeader}>
            <Text style={styles.participantsTitle}>Participantes</Text>
            <Text style={styles.participantsCount}>{participants.length}</Text>
          </View>
          <View>
            {waitingParticipants.map((participant, participantIndex) => {
              const isSubmitted = participant.status === 'submitted';
              const displayName = participant.profiles.display_name;
              return (
                <View key={participant.id} style={[styles.participantRow, participantIndex === waitingParticipants.length - 1 && styles.participantRowLast]}>
                  {participant.profiles.avatar_url ? (
                    <Image source={{ uri: participant.profiles.avatar_url }} style={styles.participantAvatar} />
                  ) : (
                    <View style={[styles.participantAvatar, styles.participantAvatarFallback, { backgroundColor: participant.profiles.avatar_color || colors.lavender }]}>
                      <Text style={styles.participantInitial}>{displayName.trim().charAt(0).toUpperCase()}</Text>
                    </View>
                  )}
                  <View style={styles.participantIdentity}>
                    <Text numberOfLines={1} style={styles.participantName}>{displayName}</Text>
                    <Text style={styles.participantMeta}>{participant.user_id === userId ? 'Tú' : isSubmitted ? 'Collage bloqueado' : 'Buscando colores'}</Text>
                  </View>
                  <View style={[styles.participantStatus, isSubmitted && styles.participantStatusDone]}>
                    <View style={[styles.participantStatusDot, isSubmitted && styles.participantStatusDotDone]} />
                    <Text style={[styles.participantStatusText, isSubmitted && styles.participantStatusTextDone]}>{isSubmitted ? 'Listo' : 'En curso'}</Text>
                  </View>
                </View>
              );
            })}
          </View>
        </Card>

        {me.status === 'submitted' && (
          <Card style={styles.ownCollageCard}>
            <View style={styles.ownCollageHeader}>
              <View>
                <Text style={styles.ownCollageTitle}>Tu collage</Text>
                <Text style={styles.ownCollageMeta}>Enviado y bloqueado</Text>
              </View>
              <View style={styles.doneBadge}><Ionicons color={colors.ink} name="checkmark" size={17} /></View>
            </View>
            <Collage participant={me} photoCount={photoCount} />
          </Card>
        )}
      </Screen>
    );
  }

  if (challenge.status === 'voting') {
    const candidates = participants.filter((participant) => participant.user_id !== userId);
    return (
      <Screen>
        <Header title="Votación" onBack={onBack} />
        {revealModal}
        <View style={styles.votingHero}>
          <View style={styles.votingHeroTop}><Text style={styles.votingKicker}>VOTACIÓN ABIERTA</Text><Ionicons color={colors.ink} name="timer-outline" size={22} /></View>
          <Text style={styles.votingTime}>{challenge.voting_ends_at ? remaining(challenge.voting_ends_at) : '24h 00m 00s'}</Text>
          <Text style={styles.votingTimeLabel}>para elegir tu favorito</Text>
        </View>
        <View style={styles.heading}><Eyebrow>Mira cada composición con calma</Eyebrow><Title>Tu favorito</Title><Body muted>Toca un collage para verlo a pantalla completa. Tienes un voto y no se puede cambiar.</Body></View>
        {me.status === 'disqualified' && <Card style={styles.notice}><Body>No completaste el reto, así que esta vez no puedes votar.</Body></Card>}
        {votedId && <Card style={styles.notice}><Body>Voto enviado. El resultado aparecerá cuando cierre la votación.</Body></Card>}
        <View style={styles.candidates}>
          {candidates.map((participant) => (
            <Card key={participant.id} style={participant.status === 'disqualified' ? { ...styles.candidateCard, ...styles.disqualified } : styles.candidateCard}>
              <View style={styles.candidateHeader}>
                {participant.profiles.avatar_url ? <Image source={{ uri: participant.profiles.avatar_url }} style={styles.candidateAvatar} /> : (
                  <View style={[styles.candidateAvatar, styles.candidateAvatarFallback, { backgroundColor: participant.profiles.avatar_color || colors.lavender }]}><Text style={styles.candidateInitial}>{participant.profiles.display_name.trim().charAt(0).toUpperCase()}</Text></View>
                )}
                <View style={styles.candidateIdentity}><Text style={styles.candidateName}>{participant.profiles.display_name}</Text><Text style={styles.candidateSubtitle}>{participant.status === 'disqualified' ? 'No completó el reto' : 'Collage final'}</Text></View>
                {votedId === participant.id && <View style={styles.voteBadge}><Ionicons color={colors.ink} name="checkmark" size={16} /><Text style={styles.voteBadgeText}>Tu voto</Text></View>}
              </View>
              {participant.status === 'submitted' && (
                <Pressable accessibilityLabel={`Ampliar collage de ${participant.profiles.display_name}`} accessibilityRole="button" onPress={() => setViewingParticipant(participant)} style={({ pressed }) => [styles.candidateCollageWrap, pressed && styles.pressedSlot]}>
                  <Collage participant={participant} photoCount={photoCount} style={styles.candidateCollage} />
                  <View style={styles.expandBadge}><Ionicons color={colors.white} name="expand-outline" size={17} /><Text style={styles.expandText}>Ver en grande</Text></View>
                </Pressable>
              )}
              {participant.status === 'submitted' && !votedId && me.status === 'submitted' && <View style={styles.candidateAction}><Button label="Votar este collage" onPress={() => vote(participant.id)} loading={busy === 'vote'} /></View>}
            </Card>
          ))}
        </View>
        <ErrorText message={error} />
        <Modal animationType="fade" visible={viewingParticipant !== null} onRequestClose={() => setViewingParticipant(null)}>
          <Pressable accessibilityLabel="Cerrar collage" accessibilityRole="button" onPress={() => setViewingParticipant(null)} style={styles.collageViewer}>
            {viewingParticipant && <Collage participant={viewingParticipant} photoCount={photoCount} style={styles.viewerCollage} />}
          </Pressable>
        </Modal>
      </Screen>
    );
  }

  const ordered = participants.map((participant) => ({
    ...participant,
    score: votes.filter((voteItem) => voteItem.voted_participant_id === participant.id).length,
  })).sort((a, b) => {
    if (a.status !== b.status) return a.status === 'submitted' ? -1 : 1;
    return b.score - a.score;
  });
  const validParticipantCount = participants.filter((participant) => participant.status === 'submitted').length;
  const automaticResultCopy = validParticipantCount === 0
    ? 'Esta vez no hubo ningún collage válido y el reto queda sin ganador.'
    : validParticipantCount === 1
      ? 'Solo hubo un collage válido, así que gana automáticamente.'
      : validParticipantCount === 2
        ? 'Con dos collages no hay una votación real: ambos comparten el primer puesto.'
        : 'Explora cada collage a pantalla completa. Los empates comparten posición.';
  let previousScore: number | null = null;
  let previousPosition = 0;
  return (
    <Screen>
      <Header title="Resultados" onBack={onBack} />
      {revealModal}
      <View style={styles.resultsHero}>
        <View style={styles.resultsHeroTop}><Text style={styles.resultsKicker}>RETO CERRADO</Text><View style={styles.resultsIcon}><Ionicons color={colors.ink} name="trophy-outline" size={20} /></View></View>
        <Title>El veredicto</Title>
        <Body>{automaticResultCopy}</Body>
      </View>
      <View style={styles.results}>
        {ordered.map((participant, index) => {
          const position = participant.score === previousScore ? previousPosition : index + 1;
          previousScore = participant.score;
          previousPosition = position;
          const voterNames = votes.filter((voteItem) => voteItem.voted_participant_id === participant.id).map((voteItem) => participants.find((item) => item.user_id === voteItem.voter_id)?.profiles.display_name).filter(Boolean);
          return (
            <Card key={participant.id} style={{ ...styles.resultCard, ...(position === 1 && participant.status === 'submitted' ? styles.winnerCard : {}), ...(participant.status === 'disqualified' ? styles.disqualified : {}) }}>
              <View style={styles.resultHeader}>
                <View style={[styles.resultPosition, position === 1 && participant.status === 'submitted' && styles.winnerPosition]}><Text style={styles.resultPositionText}>{participant.status === 'disqualified' ? '—' : `#${position}`}</Text></View>
                {participant.profiles.avatar_url ? <Image source={{ uri: participant.profiles.avatar_url }} style={styles.resultAvatar} /> : <View style={[styles.resultAvatar, styles.candidateAvatarFallback, { backgroundColor: participant.profiles.avatar_color || colors.lavender }]}><Text style={styles.candidateInitial}>{participant.profiles.display_name.trim().charAt(0).toUpperCase()}</Text></View>}
                <View style={styles.resultIdentity}><Text style={styles.candidateName}>{participant.profiles.display_name}</Text><Text style={styles.voteCount}>{participant.status === 'disqualified' ? 'No completó' : `${participant.score} voto${participant.score === 1 ? '' : 's'}`}</Text></View>
                {position === 1 && participant.status === 'submitted' && <Ionicons color={colors.ink} name="trophy" size={22} />}
              </View>
              {participant.status === 'submitted' && (
                <Pressable
                  accessibilityLabel={`Ampliar collage de ${participant.profiles.display_name}`}
                  accessibilityRole="button"
                  onPress={() => setViewingParticipant(participant)}
                  style={({ pressed }) => [styles.resultCollageWrap, pressed && styles.pressedSlot]}
                >
                  <Collage participant={participant} photoCount={photoCount} style={styles.resultCollage} />
                  <View style={styles.expandBadge}><Ionicons color={colors.white} name="expand-outline" size={17} /><Text style={styles.expandText}>Ver en grande</Text></View>
                </Pressable>
              )}
              {participant.status === 'submitted' && <View style={styles.votersWrap}><Text style={styles.voters}>{voterNames.length ? `Votaron: ${voterNames.join(', ')}` : 'Nadie votó este collage'}</Text></View>}
            </Card>
          );
        })}
      </View>
      <Modal animationType="fade" visible={viewingParticipant !== null} onRequestClose={() => setViewingParticipant(null)}>
        <Pressable accessibilityLabel="Cerrar collage" accessibilityRole="button" onPress={() => setViewingParticipant(null)} style={styles.collageViewer}>
          {viewingParticipant && <Collage participant={viewingParticipant} photoCount={photoCount} style={styles.viewerCollage} />}
        </Pressable>
      </Modal>
    </Screen>
  );
}

const styles = StyleSheet.create({
  loader: { marginTop: 100 },
  revealRoot: { flex: 1, backgroundColor: '#000000E8', padding: 22, justifyContent: 'center' },
  revealCard: { backgroundColor: colors.paper, borderRadius: 34, padding: 24, gap: 16, alignItems: 'center' },
  revealKicker: { color: colors.muted, fontSize: 15, fontWeight: '800' },
  revealTitle: { color: colors.ink, fontSize: 34, fontWeight: '900', letterSpacing: -1.4, textAlign: 'center' },
  slotMachine: { width: '100%', height: 210, borderRadius: 30, backgroundColor: colors.ink, alignItems: 'center', justifyContent: 'center', overflow: 'hidden', gap: 8, borderWidth: 8, borderColor: colors.orange },
  slotColor: { width: 128, height: 128, borderRadius: 40, borderWidth: 7, borderColor: '#FFFFFFCC' },
  slotColorPrevious: { width: 78, height: 28, borderRadius: 14, opacity: 0.35 },
  slotColorNext: { width: 78, height: 28, borderRadius: 14, opacity: 0.35 },
  revealHex: { color: colors.ink, fontSize: 16, fontWeight: '900', letterSpacing: 1.5 },
  revealBody: { color: colors.muted, fontSize: 17, lineHeight: 25, textAlign: 'center' },
  revealCountdownNote: { color: colors.ink, fontSize: 13, lineHeight: 18, fontWeight: '900', textAlign: 'center', backgroundColor: colors.yellow, borderRadius: 16, paddingHorizontal: 14, paddingVertical: 10, overflow: 'hidden' },
  finalReveal: { flex: 1, paddingTop: 86, paddingBottom: 42, alignItems: 'center', justifyContent: 'space-between' },
  finalRevealTop: { alignItems: 'center', gap: 14 },
  finalRevealKicker: { fontSize: 16, fontWeight: '900', opacity: 0.82 },
  finalRevealTitle: { fontSize: 54, lineHeight: 57, fontWeight: '900', letterSpacing: -2.2, textAlign: 'center' },
  finalRevealSwatch: { width: 168, height: 168, borderRadius: 48, borderWidth: 10, backgroundColor: '#FFFFFF22' },
  finalRevealHex: { fontSize: 25, fontWeight: '900', letterSpacing: 2.5 },
  finalRevealInfo: { width: '100%', borderRadius: 30, padding: 20, gap: 8 },
  finalRevealTime: { fontSize: 28, fontWeight: '900', textAlign: 'center', letterSpacing: -0.6 },
  finalRevealCopy: { fontSize: 16, lineHeight: 23, textAlign: 'center', fontWeight: '700', opacity: 0.9 },
  finalRevealButton: { width: '100%', minHeight: 64, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  finalRevealButtonPressed: { opacity: 0.75, transform: [{ translateY: 1 }] },
  finalRevealButtonText: { fontSize: 17, fontWeight: '900' },
  heading: { marginVertical: 24, gap: 8 },
  challengeHeading: { minHeight: 126, padding: 20, borderRadius: 28, backgroundColor: colors.lavender, flexDirection: 'row', alignItems: 'center', gap: 18, marginVertical: 22 },
  headingText: { flex: 1 },
  bigSwatch: { width: 72, height: 72, borderRadius: 24, borderWidth: 6, borderColor: '#FFFFFF88' },
  editGrid: { width: '100%', flexDirection: 'row', flexWrap: 'wrap', marginTop: 24, marginBottom: 12, overflow: 'hidden' },
  editSlot: { width: '50%', backgroundColor: colors.blue, overflow: 'hidden', justifyContent: 'center', alignItems: 'center' },
  pressedSlot: { opacity: 0.78, transform: [{ scale: 0.99 }] },
  editImage: { position: 'absolute', inset: 0 },
  emptySlotContent: { alignItems: 'center', gap: 8 },
  emptySlotText: { color: colors.ink, fontSize: 13, fontWeight: '800' },
  slotNumber: { position: 'absolute', left: 12, top: 12, color: colors.ink, backgroundColor: '#FFFFFF99', borderRadius: 14, overflow: 'hidden', paddingHorizontal: 9, paddingVertical: 5, fontSize: 12, fontWeight: '900' },
  slotNumberFilled: { color: colors.white, backgroundColor: '#111217AA' },
  imageLoader: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, backgroundColor: '#00000066', alignItems: 'center', justifyContent: 'center' },
  progressWrap: { flexDirection: 'row', justifyContent: 'center', gap: 7, marginTop: 2, marginBottom: 7 },
  progressDot: { width: 9, height: 9, borderRadius: 5, backgroundColor: colors.line },
  progressDotDone: { width: 22, backgroundColor: colors.ink },
  progress: { textAlign: 'center', color: colors.muted, fontSize: 13, fontWeight: '600', marginBottom: 14 },
  actionStack: { gap: 10 },
  previewRoot: { flex: 1, backgroundColor: colors.ink, paddingHorizontal: 18, paddingTop: 112 },
  previewHeader: { position: 'absolute', top: 54, left: 18, right: 18, zIndex: 2, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  previewKicker: { color: colors.green, fontSize: 10, fontWeight: '900', letterSpacing: 1.2, marginBottom: 3 },
  previewTitle: { color: colors.white, fontSize: 25, lineHeight: 29, fontWeight: '900' },
  previewClose: { width: 42, height: 42, borderRadius: 21, backgroundColor: '#FFFFFF22', alignItems: 'center', justifyContent: 'center' },
  previewContent: { flexGrow: 1, justifyContent: 'center', paddingBottom: 38, gap: 14 },
  previewStage: { alignItems: 'center', justifyContent: 'center' },
  previewHalo: { position: 'absolute', width: '82%', aspectRatio: 0.58, borderRadius: 46, backgroundColor: colors.lavender, opacity: 0.22, transform: [{ rotate: '-5deg' }] },
  previewFrame: { width: '86%', borderRadius: 30, paddingTop: 38, shadowColor: '#000000', shadowOffset: { width: 0, height: 18 }, shadowOpacity: 0.42, shadowRadius: 26, elevation: 14 },
  previewChrome: { position: 'absolute', top: 14, left: 16, flexDirection: 'row', gap: 5 },
  previewChromeDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.orange },
  previewChromeDotMuted: { backgroundColor: colors.green },
  previewChromeDotDark: { backgroundColor: colors.ink },
  previewCollage: { marginBottom: 0, borderRadius: 22, overflow: 'hidden', backgroundColor: colors.ink },
  previewBadge: { position: 'absolute', right: 16, top: 10, minHeight: 27, borderRadius: 14, paddingHorizontal: 10, backgroundColor: colors.yellow, flexDirection: 'row', alignItems: 'center', gap: 5 },
  previewBadgeText: { color: colors.ink, fontSize: 11, fontWeight: '900' },
  previewFooter: { flexDirection: 'row', gap: 8, justifyContent: 'center', flexWrap: 'wrap' },
  previewChip: { minHeight: 42, borderRadius: 21, paddingHorizontal: 13, backgroundColor: '#FFFFFF12', flexDirection: 'row', alignItems: 'center', gap: 8 },
  previewChipText: { color: colors.white, fontSize: 12, fontWeight: '800' },
  previewHint: { color: colors.white, opacity: 0.58, fontSize: 12, lineHeight: 17, textAlign: 'center', paddingHorizontal: 18 },
  previewCard: { width: '100%', overflow: 'hidden', backgroundColor: colors.paper, flexDirection: 'row', flexWrap: 'wrap', gap: 0 },
  previewPhoto: { width: '50%' },
  previewMissing: { backgroundColor: '#2A2A2D', alignItems: 'center', justifyContent: 'center' },
  previewSlot: { color: colors.white, opacity: 0.45, fontSize: 28, fontWeight: '900' },
  photoDetailRoot: { flex: 1, backgroundColor: '#000000DD', padding: 18, justifyContent: 'center' },
  photoDetailCard: { gap: 12 },
  photoDetailImage: { width: '100%', aspectRatio: 0.78, borderRadius: 30, backgroundColor: colors.ink },
  photoDetailActions: { flexDirection: 'row', gap: 10 },
  cropRoot: { flex: 1, backgroundColor: '#000000E8', padding: 18, paddingTop: 74, justifyContent: 'center' },
  cropHeader: { position: 'absolute', top: 54, left: 18, right: 18, zIndex: 2, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  cropContent: { gap: 16 },
  cropFrame: { width: '100%', backgroundColor: colors.ink, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  cropImage: { position: 'absolute' },
  cropGuide: { ...StyleSheet.absoluteFillObject, borderWidth: 2, borderColor: '#FFFFFFAA' },
  cropHint: { color: colors.white, opacity: 0.72, textAlign: 'center', fontSize: 13, lineHeight: 18 },
  waitingHero: { minHeight: 220, padding: 22, borderRadius: 30, backgroundColor: colors.lavender, justifyContent: 'space-between', gap: 28, marginTop: 18, marginBottom: 14, overflow: 'hidden' },
  waitingHeroTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  waitingDoneIcon: { width: 44, height: 44, borderRadius: 16, backgroundColor: colors.green, alignItems: 'center', justifyContent: 'center' },
  timeBadge: { color: colors.ink, fontSize: 12, fontWeight: '800', backgroundColor: '#FFFFFF66', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 16, overflow: 'hidden' },
  waitingHeroCopy: { maxWidth: '92%', gap: 7 },
  waitingKicker: { color: '#11121799', fontSize: 11, fontWeight: '900', letterSpacing: 1 },
  waitingProgressCard: { gap: 18 },
  waitingProgressHeader: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: 16 },
  waitingSectionLabel: { color: colors.muted, fontSize: 10, fontWeight: '900', letterSpacing: 1 },
  waitingProgressValue: { color: colors.ink, fontSize: 44, lineHeight: 48, fontWeight: '900', letterSpacing: -1.8, marginTop: 3 },
  waitingProgressTotal: { color: colors.muted, fontSize: 22, letterSpacing: -0.8 },
  waitingProgressCaption: { color: colors.ink, fontSize: 12, fontWeight: '800', backgroundColor: colors.paper, paddingHorizontal: 11, paddingVertical: 8, borderRadius: 15, overflow: 'hidden' },
  waitingProgressTrack: { height: 10, borderRadius: 5, backgroundColor: colors.line, overflow: 'hidden' },
  waitingProgressFill: { height: 10, borderRadius: 5, backgroundColor: colors.green },
  participantsCard: { marginTop: 14, paddingBottom: 4 },
  participantsHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 },
  participantsTitle: { color: colors.ink, fontSize: 19, fontWeight: '900', letterSpacing: -0.3 },
  participantsCount: { minWidth: 30, height: 30, borderRadius: 15, backgroundColor: colors.paper, color: colors.muted, textAlign: 'center', textAlignVertical: 'center', lineHeight: 30, fontSize: 12, fontWeight: '900', overflow: 'hidden' },
  participantRow: { minHeight: 70, flexDirection: 'row', alignItems: 'center', gap: 12, borderBottomWidth: 1, borderBottomColor: colors.line },
  participantRowLast: { borderBottomWidth: 0 },
  participantAvatar: { width: 42, height: 42, borderRadius: 15 },
  participantAvatarFallback: { alignItems: 'center', justifyContent: 'center' },
  participantInitial: { color: colors.ink, fontSize: 16, fontWeight: '900' },
  participantIdentity: { flex: 1, minWidth: 0 },
  participantName: { color: colors.ink, fontSize: 14, fontWeight: '800' },
  participantMeta: { color: colors.muted, fontSize: 11, marginTop: 3 },
  participantStatus: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 9, paddingVertical: 7, borderRadius: 14, backgroundColor: colors.paper },
  participantStatusDone: { backgroundColor: '#DDF5E9' },
  participantStatusDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.muted },
  participantStatusDotDone: { backgroundColor: '#287957' },
  participantStatusText: { color: colors.muted, fontSize: 10, fontWeight: '800' },
  participantStatusTextDone: { color: '#287957' },
  ownCollageCard: { marginTop: 14, backgroundColor: colors.surface, gap: 12 },
  ownCollageHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  ownCollageTitle: { color: colors.ink, fontSize: 18, fontWeight: '900' },
  ownCollageMeta: { color: colors.muted, fontSize: 12, marginTop: 2 },
  doneBadge: { width: 34, height: 34, borderRadius: 17, backgroundColor: colors.green, alignItems: 'center', justifyContent: 'center' },
  notice: { marginBottom: 16, backgroundColor: colors.yellow, borderWidth: 0 },
  votingHero: { minHeight: 180, marginTop: 18, borderRadius: 30, padding: 22, backgroundColor: colors.yellow, justifyContent: 'flex-end' },
  votingHeroTop: { position: 'absolute', top: 20, left: 22, right: 22, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  votingKicker: { color: '#11121799', fontSize: 11, fontWeight: '900', letterSpacing: 1.1 },
  votingTime: { color: colors.ink, fontSize: 46, lineHeight: 50, fontWeight: '900', letterSpacing: -1.8 },
  votingTimeLabel: { color: colors.ink, opacity: 0.68, fontSize: 14, fontWeight: '700', marginTop: 3 },
  candidates: { gap: 18 },
  candidateCard: { overflow: 'hidden' },
  candidateHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 14 },
  candidateAvatar: { width: 44, height: 44, borderRadius: 15 },
  candidateAvatarFallback: { alignItems: 'center', justifyContent: 'center' },
  candidateInitial: { color: colors.ink, fontSize: 16, fontWeight: '900' },
  candidateIdentity: { flex: 1, minWidth: 0, justifyContent: 'center', marginHorizontal: 12 },
  candidateName: { color: colors.ink, fontSize: 19, fontWeight: '800' },
  candidateSubtitle: { color: colors.muted, fontSize: 12, marginTop: 3 },
  candidateState: { color: colors.danger, fontSize: 12, fontWeight: '600' },
  candidateCollageWrap: { position: 'relative', overflow: 'hidden', borderRadius: 18, backgroundColor: colors.ink },
  candidateCollage: { marginBottom: 0 },
  candidateAction: { marginTop: 14 },
  voteBadge: { flexDirection: 'row', alignItems: 'center', alignSelf: 'center', gap: 4, borderRadius: 14, paddingHorizontal: 9, paddingVertical: 7, backgroundColor: colors.green },
  voteBadgeText: { color: colors.ink, fontSize: 10, fontWeight: '900' },
  expandBadge: { position: 'absolute', right: 10, bottom: 10, flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 16, paddingHorizontal: 10, paddingVertical: 8, backgroundColor: '#111217D9' },
  expandText: { color: colors.white, fontSize: 11, fontWeight: '800' },
  collage: { flexDirection: 'row', flexWrap: 'wrap', marginBottom: 15 },
  collagePhoto: {},
  photoMissing: { backgroundColor: colors.line },
  disqualified: { opacity: 0.52 },
  yourVote: { color: colors.green, textAlign: 'center', fontWeight: '600', marginTop: 5 },
  resultsHero: { minHeight: 220, marginTop: 18, marginBottom: 18, borderRadius: 30, padding: 22, backgroundColor: colors.lavender, justifyContent: 'flex-end', gap: 8, overflow: 'hidden' },
  resultsHeroTop: { position: 'absolute', left: 22, right: 22, top: 20, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  resultsKicker: { color: '#11121799', fontSize: 11, fontWeight: '900', letterSpacing: 1.1 },
  resultsIcon: { width: 44, height: 44, borderRadius: 16, backgroundColor: colors.yellow, alignItems: 'center', justifyContent: 'center', transform: [{ rotate: '6deg' }] },
  results: { gap: 18 },
  resultCard: { padding: 0, overflow: 'hidden' },
  winnerCard: { borderColor: colors.yellow, borderWidth: 3 },
  resultHeader: { minHeight: 82, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', gap: 11 },
  resultPosition: { minWidth: 43, height: 34, paddingHorizontal: 9, borderRadius: 13, backgroundColor: colors.paper, alignItems: 'center', justifyContent: 'center' },
  winnerPosition: { backgroundColor: colors.yellow },
  resultPositionText: { color: colors.ink, fontSize: 17, fontWeight: '900' },
  resultAvatar: { width: 42, height: 42, borderRadius: 14 },
  resultIdentity: { flex: 1 },
  voteCount: { color: colors.muted, marginTop: 3 },
  resultCollageWrap: { position: 'relative', overflow: 'hidden', backgroundColor: colors.ink },
  resultCollage: { marginBottom: 0 },
  votersWrap: { minHeight: 52, paddingHorizontal: 16, justifyContent: 'center' },
  voters: { color: colors.muted, fontSize: 12, lineHeight: 18 },
  collageViewer: { flex: 1, backgroundColor: colors.ink, alignItems: 'center', justifyContent: 'center' },
  viewerCollage: { width: '100%', marginBottom: 0, backgroundColor: '#292A31' },
});
