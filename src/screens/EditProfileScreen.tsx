import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Image, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { decode } from 'base64-arraybuffer';
import { Body, Button, ErrorText, Field, Header, Screen, Title } from '@/components/ui';
import { supabase } from '@/lib/supabase';
import { colors } from '@/lib/theme';
import type { Profile } from '@/types/domain';

const profileColors = ['#E84A3C', '#3157D5', '#F4C542', '#3A8D67', '#E75A9D', '#F27C38', '#7450A8', '#E9E6DF', '#30B7C2', '#9C6ADE', '#6B4F3A', '#111217'];

export function EditProfileScreen({ userId, onBack, onSaved }: { userId: string; onBack: () => void; onSaved: () => void }) {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [displayName, setDisplayName] = useState('');
  const [username, setUsername] = useState('');
  const [bio, setBio] = useState('');
  const [favoriteColor, setFavoriteColor] = useState(profileColors[0]!);
  const [statusText, setStatusText] = useState('');
  const [preferredPhotoSource, setPreferredPhotoSource] = useState<Profile['preferred_photo_source']>('camera');
  const [avatarColor, setAvatarColor] = useState(colors.ink);
  const [rankingDisplayName, setRankingDisplayName] = useState<Profile['ranking_display_name']>('display_name');
  const [saving, setSaving] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function load() {
    const { data, error: profileError } = await supabase.from('profiles').select('*').eq('id', userId).single();
    if (profileError) setError(profileError.message);
    else {
      const nextProfile = data as Profile;
      setProfile(nextProfile);
      setDisplayName(nextProfile.display_name);
      setUsername(nextProfile.username);
      setBio(nextProfile.bio ?? '');
      setFavoriteColor(nextProfile.favorite_color ?? profileColors[0]!);
      setStatusText(nextProfile.status_text ?? '');
      setPreferredPhotoSource(nextProfile.preferred_photo_source ?? 'camera');
      setAvatarColor(nextProfile.avatar_color ?? colors.ink);
      setRankingDisplayName(nextProfile.ranking_display_name ?? 'display_name');
      setError(null);
    }
  }

  useEffect(() => { void load(); }, [userId]);

  async function saveProfile() {
    const normalized = username.trim().toLowerCase().replace(/^@/, '');
    if (displayName.trim().length < 2) { setError('El nombre debe tener al menos 2 caracteres.'); return; }
    if (!/^[a-z0-9_]{3,32}$/.test(normalized)) {
      setError('El usuario debe tener entre 3 y 32 caracteres: letras minúsculas, números o guion bajo.');
      return;
    }
    if (bio.length > 120) { setError('La bio puede tener hasta 120 caracteres.'); return; }
    if (statusText.length > 40) { setError('El estado puede tener hasta 40 caracteres.'); return; }
    setSaving(true);
    setError(null);
    setMessage(null);
    const { data, error: updateError } = await supabase.from('profiles').update({
      display_name: displayName.trim(),
      username: normalized,
      bio: bio.trim(),
      favorite_color: favoriteColor,
      status_text: statusText.trim(),
      preferred_photo_source: preferredPhotoSource,
      avatar_color: avatarColor,
      ranking_display_name: rankingDisplayName,
    }).eq('id', userId).select('*').single();
    if (updateError) setError(updateError.code === '23505' ? 'Ese nombre de usuario ya está ocupado.' : updateError.message);
    else {
      setProfile(data as Profile);
      setDisplayName(data.display_name as string);
      setUsername(data.username as string);
      onSaved();
    }
    setSaving(false);
  }

  async function uploadAvatar(uri: string) {
    setUploadingAvatar(true);
    setError(null);
    setMessage(null);
    try {
      const response = await fetch(uri);
      const blob = await response.blob();
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onerror = reject;
        reader.onload = () => resolve(String(reader.result).split(',')[1] ?? '');
        reader.readAsDataURL(blob);
      });
      const path = `${userId}/avatar-${Date.now()}.jpg`;
      const upload = await supabase.storage.from('avatars').upload(path, decode(base64), { contentType: 'image/jpeg', upsert: true });
      if (upload.error) throw upload.error;
      const { data } = supabase.storage.from('avatars').getPublicUrl(path);
      const update = await supabase.from('profiles').update({ avatar_url: data.publicUrl }).eq('id', userId).select('*').single();
      if (update.error) throw update.error;
      setProfile(update.data as Profile);
      setMessage('Foto de perfil actualizada.');
    } catch (caught) { setError((caught as Error).message); }
    setUploadingAvatar(false);
  }

  async function chooseAvatar(camera: boolean) {
    const result = camera
      ? await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.82, allowsEditing: true, aspect: [1, 1] })
      : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.82, allowsEditing: true, aspect: [1, 1] });
    if (!result.canceled) await uploadAvatar(result.assets[0]!.uri);
  }

  function openAvatarPicker() {
    Alert.alert('Foto de perfil', 'Actualiza tu imagen pública.', [
      { text: 'Cámara', onPress: () => void chooseAvatar(true) },
      { text: 'Galería', onPress: () => void chooseAvatar(false) },
      { text: 'Cancelar', style: 'cancel' },
    ]);
  }

  return (
    <Screen stickyHeader bottomInset={28}>
      <Header title="Editar perfil" onBack={onBack} />
      <View style={styles.heading}><Title>Perfil público</Title><Body muted>Actualiza cómo te ven tus amigos en Color Club.</Body></View>
      <ErrorText message={error} />
      {!profile && !error ? <ActivityIndicator style={styles.loader} color={colors.coral} /> : profile && (
        <>
          <View style={styles.avatarPanel}>
            <Pressable accessibilityRole="button" accessibilityLabel="Cambiar foto de perfil" onPress={openAvatarPicker} style={({ pressed }) => [styles.avatar, pressed && styles.pressed]}>
              {profile.avatar_url ? <Image source={{ uri: profile.avatar_url }} style={styles.avatarImage} /> : <Text style={[styles.initial, { backgroundColor: avatarColor }]}>{profile.display_name.charAt(0).toUpperCase()}</Text>}
              <View style={styles.cameraBadge}>{uploadingAvatar ? <ActivityIndicator color={colors.ink} size="small" /> : <Ionicons color={colors.ink} name="camera" size={15} />}</View>
            </Pressable>
            <View style={styles.avatarCopy}><Text style={styles.avatarTitle}>Foto y nombre</Text><Text style={styles.avatarText}>Esta información aparece en retos, rankings y chat.</Text></View>
          </View>
          <View style={styles.formCard}>
            <Field label="Nombre visible" value={displayName} onChangeText={setDisplayName} autoCapitalize="words" />
            <Field label="Nombre de usuario" value={username} onChangeText={setUsername} autoCapitalize="none" autoCorrect={false} />
            <View style={styles.textareaWrap}>
              <Text style={styles.textareaLabel}>Bio ({bio.length}/120)</Text>
              <TextInput value={bio} onChangeText={setBio} multiline maxLength={120} placeholder="Cuenta algo corto sobre ti..." placeholderTextColor={colors.muted} style={styles.textarea} textAlignVertical="top" />
            </View>
            <Field label={`Estado visible (${statusText.length}/40)`} value={statusText} onChangeText={setStatusText} maxLength={40} placeholder="Ej. cazando amarillo" />
            <Text style={styles.optionTitle}>Color favorito</Text>
            <View style={styles.colorGrid}>{profileColors.map((item) => <Pressable key={item} accessibilityLabel={`Color favorito ${item}`} onPress={() => setFavoriteColor(item)} style={[styles.colorOption, { backgroundColor: item }, favoriteColor === item && styles.colorSelected]} />)}</View>
            {!profile.avatar_url && <Text style={styles.optionTitle}>Color de avatar sin foto</Text>}
            {!profile.avatar_url && <View style={styles.colorGrid}>{profileColors.map((item) => <Pressable key={item} accessibilityLabel={`Color de avatar ${item}`} onPress={() => setAvatarColor(item)} style={[styles.colorOption, { backgroundColor: item }, avatarColor === item && styles.colorSelected]} />)}</View>}
            <Text style={styles.optionTitle}>Preferencia al añadir fotos</Text>
            <View style={styles.segmented}>
              <Pressable onPress={() => setPreferredPhotoSource('camera')} style={[styles.segment, preferredPhotoSource === 'camera' && styles.segmentActive]}><Ionicons color={preferredPhotoSource === 'camera' ? colors.white : colors.ink} name="camera-outline" size={17} /><Text style={[styles.segmentText, preferredPhotoSource === 'camera' && styles.segmentTextActive]}>Cámara</Text></Pressable>
              <Pressable onPress={() => setPreferredPhotoSource('library')} style={[styles.segment, preferredPhotoSource === 'library' && styles.segmentActive]}><Ionicons color={preferredPhotoSource === 'library' ? colors.white : colors.ink} name="images-outline" size={17} /><Text style={[styles.segmentText, preferredPhotoSource === 'library' && styles.segmentTextActive]}>Galería</Text></Pressable>
            </View>
            <Text style={styles.optionTitle}>Nombre en rankings</Text>
            <View style={styles.segmented}>
              <Pressable onPress={() => setRankingDisplayName('display_name')} style={[styles.segment, rankingDisplayName === 'display_name' && styles.segmentActive]}><Text style={[styles.segmentText, rankingDisplayName === 'display_name' && styles.segmentTextActive]}>Nombre</Text></Pressable>
              <Pressable onPress={() => setRankingDisplayName('username')} style={[styles.segment, rankingDisplayName === 'username' && styles.segmentActive]}><Text style={[styles.segmentText, rankingDisplayName === 'username' && styles.segmentTextActive]}>@usuario</Text></Pressable>
            </View>
            {message && <Text style={styles.message}>{message}</Text>}
            <Button label="Guardar cambios" onPress={saveProfile} loading={saving} disabled={displayName === profile.display_name && username === profile.username && bio === profile.bio && favoriteColor === profile.favorite_color && statusText === profile.status_text && preferredPhotoSource === profile.preferred_photo_source && avatarColor === profile.avatar_color && rankingDisplayName === profile.ranking_display_name} />
          </View>
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  heading: { marginTop: 24, marginBottom: 22, gap: 8 },
  loader: { marginTop: 60 },
  avatarPanel: { minHeight: 144, padding: 20, borderRadius: 30, backgroundColor: colors.lavender, flexDirection: 'row', alignItems: 'center', gap: 16, overflow: 'hidden' },
  avatar: { width: 78, height: 78, borderRadius: 39, backgroundColor: colors.ink, alignItems: 'center', justifyContent: 'center' },
  avatarImage: { width: 78, height: 78, borderRadius: 39 },
  initial: { width: 78, height: 78, borderRadius: 39, overflow: 'hidden', color: colors.white, fontSize: 28, lineHeight: 78, textAlign: 'center', fontWeight: '800' },
  cameraBadge: { position: 'absolute', right: -2, bottom: -1, width: 30, height: 30, borderRadius: 15, backgroundColor: colors.white, borderWidth: 2, borderColor: colors.lavender, alignItems: 'center', justifyContent: 'center' },
  avatarCopy: { flex: 1, gap: 4 },
  avatarTitle: { color: colors.ink, fontSize: 22, fontWeight: '900' },
  avatarText: { color: colors.ink, opacity: 0.68, fontSize: 13, lineHeight: 18 },
  formCard: { marginTop: 18, padding: 18, borderRadius: 28, backgroundColor: colors.blue, gap: 14 },
  textareaWrap: { gap: 7 },
  textareaLabel: { color: colors.muted, fontSize: 13, fontWeight: '600' },
  textarea: { minHeight: 104, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, borderRadius: 18, paddingHorizontal: 16, paddingVertical: 14, color: colors.ink, fontSize: 16, lineHeight: 22 },
  optionTitle: { color: colors.ink, fontSize: 14, fontWeight: '900', marginTop: 4 },
  colorGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  colorOption: { width: 42, height: 42, borderRadius: 16, borderWidth: 3, borderColor: '#FFFFFF88' },
  colorSelected: { borderColor: colors.ink, transform: [{ scale: 1.08 }] },
  segmented: { flexDirection: 'row', padding: 5, borderRadius: 22, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, gap: 5 },
  segment: { flex: 1, minHeight: 44, borderRadius: 17, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 7 },
  segmentActive: { backgroundColor: colors.ink },
  segmentText: { color: colors.ink, fontSize: 13, fontWeight: '800' },
  segmentTextActive: { color: colors.white },
  message: { color: colors.green, fontSize: 13, fontWeight: '800' },
  pressed: { opacity: 0.55 },
});
