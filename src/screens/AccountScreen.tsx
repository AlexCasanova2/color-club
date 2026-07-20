import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Image, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import * as ImagePicker from 'expo-image-picker';
import { decode } from 'base64-arraybuffer';
import { Body, Button, ErrorText, Field, Header, Screen, Title } from '@/components/ui';
import { supabase } from '@/lib/supabase';
import { colors } from '@/lib/theme';
import type { Profile } from '@/types/domain';

type BooleanSetting = 'challenge_notifications' | 'friend_notifications' | 'weekly_summary' | 'allow_friend_requests' | 'profile_discoverable';

function SettingRow({ icon, title, description, value, onChange, last = false }: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  description: string;
  value: boolean;
  onChange: (value: boolean) => void;
  last?: boolean;
}) {
  return (
    <View style={[styles.settingRow, last && styles.lastRow]}>
      <View style={styles.settingIcon}><Ionicons color={colors.ink} name={icon} size={20} /></View>
      <View style={styles.settingCopy}><Text style={styles.settingTitle}>{title}</Text><Text style={styles.settingDescription}>{description}</Text></View>
      <View style={styles.switchSlot}>
        <Switch onValueChange={onChange} trackColor={{ false: '#D6D4CD', true: colors.ink }} value={value} />
      </View>
    </View>
  );
}

export function AccountScreen({ userId, email }: { userId: string; email: string }) {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [displayName, setDisplayName] = useState('');
  const [username, setUsername] = useState('');
  const [saving, setSaving] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteText, setDeleteText] = useState('');
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    void supabase.from('profiles').select('*').eq('id', userId).single().then(({ data, error: profileError }) => {
      if (profileError) setError(profileError.message);
      else {
        const nextProfile = data as Profile;
        setProfile(nextProfile);
        setDisplayName(nextProfile.display_name);
        setUsername(nextProfile.username);
      }
    });
  }, [userId]);

  async function saveProfile() {
    const normalized = username.trim().toLowerCase().replace(/^@/, '');
    if (displayName.trim().length < 2) { setError('El nombre debe tener al menos 2 caracteres.'); return; }
    if (!/^[a-z0-9_]{3,32}$/.test(normalized)) {
      setError('El usuario debe tener entre 3 y 32 caracteres: letras minúsculas, números o guion bajo.');
      return;
    }
    setSaving(true);
    setError(null);
    setMessage(null);
    const { data, error: updateError } = await supabase.from('profiles').update({ display_name: displayName.trim(), username: normalized }).eq('id', userId).select('*').single();
    if (updateError) setError(updateError.code === '23505' ? 'Ese nombre de usuario ya está ocupado.' : updateError.message);
    else {
      setProfile(data as Profile);
      setDisplayName(data.display_name as string);
      setUsername(data.username as string);
      showToast('Perfil actualizado.');
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
      const upload = await supabase.storage.from('avatars').upload(path, decode(base64), {
        contentType: 'image/jpeg',
        upsert: true,
      });
      if (upload.error) throw upload.error;
      const { data } = supabase.storage.from('avatars').getPublicUrl(path);
      const update = await supabase.from('profiles').update({ avatar_url: data.publicUrl }).eq('id', userId).select('*').single();
      if (update.error) throw update.error;
      setProfile(update.data as Profile);
      showToast('Foto de perfil actualizada.');
    } catch (caught) {
      setError((caught as Error).message);
    }
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

  async function copyFriendCode() {
    if (!profile) return;
    await Clipboard.setStringAsync(profile.friend_code);
    showToast('Código copiado al portapapeles.');
  }

  function showToast(text: string) {
    setToast(text);
    setTimeout(() => setToast(null), 1500);
  }

  async function updateSetting(key: BooleanSetting, value: boolean) {
    if (!profile) return;
    const previous = profile[key] ?? (key === 'weekly_summary' ? false : true);
    setProfile({ ...profile, [key]: value });
    setError(null);
    const { error: updateError } = await supabase.from('profiles').update({ [key]: value }).eq('id', userId);
    if (updateError) {
      setProfile((current) => current ? { ...current, [key]: previous } : current);
      setError(updateError.message);
    }
  }

  async function deleteAccount() {
    if (deleteText !== 'BORRAR') return;
    setDeleting(true);
    setError(null);
    const { error: deleteError } = await supabase.rpc('delete_own_account', { confirmation: deleteText });
    if (deleteError) { setError(deleteError.message); setDeleting(false); setDeleteOpen(false); return; }
    await supabase.auth.signOut();
  }

  const value = (key: BooleanSetting, fallback = true) => profile?.[key] ?? fallback;

  return (
    <Screen>
      <Header title="Cuenta" />
      <View style={styles.heading}><Title>Tu perfil</Title><Body muted>Gestiona cómo apareces y cómo quieres usar Color Club.</Body></View>
      <ErrorText message={error} />
      {!profile && !error ? <ActivityIndicator style={styles.loader} color={colors.coral} /> : profile && (
        <>
          <View style={styles.profileHero}>
            <Pressable accessibilityRole="button" accessibilityLabel="Cambiar foto de perfil" onPress={openAvatarPicker} style={({ pressed }) => [styles.avatar, pressed && styles.pressed]}>
              {profile.avatar_url ? <Image source={{ uri: profile.avatar_url }} style={styles.avatarImage} /> : <Text style={styles.initial}>{profile.display_name.charAt(0).toUpperCase()}</Text>}
              <View style={styles.cameraBadge}>{uploadingAvatar ? <ActivityIndicator color={colors.ink} size="small" /> : <Ionicons color={colors.ink} name="camera" size={15} />}</View>
            </Pressable>
            <View style={styles.identity}><Text style={styles.name}>{profile.display_name}</Text><Text style={styles.username}>@{profile.username}</Text><Text style={styles.email}>{email}</Text></View>
            <View style={styles.heroShape} />
          </View>

          <Pressable accessibilityRole="button" accessibilityLabel="Copiar código público" onPress={copyFriendCode} style={({ pressed }) => [styles.codeCard, pressed && styles.pressed]}>
            <View style={styles.codeIcon}><Ionicons color={colors.ink} name="qr-code-outline" size={23} /></View>
            <View style={styles.codeCopy}><Text style={styles.codeLabel}>Código público</Text><Text style={styles.codeHint}>Tus amigos pueden encontrarte con él</Text></View>
            <Text style={styles.code}>{profile.friend_code}</Text>
            <Ionicons color={colors.ink} name="copy-outline" size={18} />
          </Pressable>

          <Text style={styles.sectionTitle}>Perfil público</Text>
          <View style={[styles.sectionCard, styles.publicSection]}>
            <Field label="Nombre visible" value={displayName} onChangeText={setDisplayName} autoCapitalize="words" />
            <Field label="Nombre de usuario" value={username} onChangeText={setUsername} autoCapitalize="none" autoCorrect={false} />
            <Button label="Guardar cambios" onPress={saveProfile} loading={saving} disabled={displayName === profile.display_name && username === profile.username} />
          </View>

          <Text style={styles.sectionTitle}>Notificaciones</Text>
          <View style={styles.sectionCard}>
            <SettingRow icon="color-palette-outline" title="Retos del club" description="Inicios, plazos y votaciones" value={value('challenge_notifications')} onChange={(next) => void updateSetting('challenge_notifications', next)} />
            <SettingRow icon="people-outline" title="Solicitudes de amistad" description="Cuando alguien quiera añadirte" value={value('friend_notifications')} onChange={(next) => void updateSetting('friend_notifications', next)} last />
          </View>

          <Text style={styles.sectionTitle}>Privacidad</Text>
          <View style={styles.sectionCard}>
            <SettingRow icon="search-outline" title="Perfil visible" description="Permite encontrarte por usuario o código" value={value('profile_discoverable')} onChange={(next) => void updateSetting('profile_discoverable', next)} />
            <SettingRow icon="person-add-outline" title="Nuevas solicitudes" description="Permite que otros te envíen solicitudes" value={value('allow_friend_requests')} onChange={(next) => void updateSetting('allow_friend_requests', next)} last />
          </View>

          <Text style={styles.sectionTitle}>Preferencias</Text>
          <View style={styles.sectionCard}>
            <SettingRow icon="calendar-outline" title="Resumen semanal" description="Recibe un resumen de tu actividad" value={value('weekly_summary', false)} onChange={(next) => void updateSetting('weekly_summary', next)} last />
            <View style={styles.infoRow}><View style={styles.settingIcon}><Ionicons color={colors.ink} name="language-outline" size={20} /></View><View style={styles.settingCopy}><Text style={styles.settingTitle}>Idioma</Text><Text style={styles.settingDescription}>Idioma de la aplicación</Text></View><Text style={styles.infoValue}>Español</Text></View>
          </View>

          <Text style={styles.sectionTitle}>Cuenta y seguridad</Text>
          <View style={styles.sectionCard}>
            <Pressable onPress={() => void supabase.auth.signOut()} style={({ pressed }) => [styles.actionRow, pressed && styles.pressed]}>
              <View style={styles.settingIcon}><Ionicons color={colors.ink} name="log-out-outline" size={20} /></View><View style={styles.settingCopy}><Text style={styles.settingTitle}>Cerrar sesión</Text><Text style={styles.settingDescription}>Salir de esta cuenta en el dispositivo</Text></View><Ionicons color={colors.muted} name="chevron-forward" size={18} />
            </Pressable>
            <Pressable onPress={() => { setDeleteText(''); setDeleteOpen(true); }} style={({ pressed }) => [styles.deleteRow, pressed && styles.pressed]}>
              <View style={styles.deleteIcon}><Ionicons color={colors.danger} name="trash-outline" size={20} /></View><View style={styles.settingCopy}><Text style={styles.deleteTitle}>Borrar cuenta</Text><Text style={styles.settingDescription}>Elimina permanentemente tu cuenta y tus datos</Text></View><Ionicons color={colors.danger} name="chevron-forward" size={18} />
            </Pressable>
          </View>
        </>
      )}

      <Modal animationType="fade" transparent visible={deleteOpen} onRequestClose={() => setDeleteOpen(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.modal}>
          <Pressable style={styles.scrim} onPress={() => setDeleteOpen(false)} />
          <ScrollView contentContainerStyle={styles.deleteSheet} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            <View style={styles.warningIcon}><Ionicons color={colors.danger} name="warning-outline" size={30} /></View>
            <Title size="medium">Borrar la cuenta</Title>
            <Body muted>Esta acción es definitiva. También se eliminarán los clubs que administras. Escribe BORRAR para confirmar.</Body>
            <Field label="Confirmación" value={deleteText} onChangeText={setDeleteText} autoCapitalize="characters" autoCorrect={false} />
            <Button label="Borrar mi cuenta" onPress={deleteAccount} loading={deleting} disabled={deleteText !== 'BORRAR'} variant="danger" />
            <Button label="Cancelar" onPress={() => setDeleteOpen(false)} variant="quiet" />
          </ScrollView>
        </KeyboardAvoidingView>
      </Modal>
      <Modal animationType="fade" transparent visible={toast !== null}>
        <View pointerEvents="none" style={styles.toastLayer}>
          <View style={styles.toast}>
            <Ionicons color={colors.ink} name="checkmark-circle" size={20} />
            <Text style={styles.toastText}>{toast}</Text>
          </View>
        </View>
      </Modal>
    </Screen>
  );
}

const styles = StyleSheet.create({
  heading: { marginTop: 24, marginBottom: 22, gap: 8 },
  loader: { marginTop: 60 },
  profileHero: { minHeight: 154, padding: 22, borderRadius: 30, backgroundColor: colors.lavender, flexDirection: 'row', alignItems: 'center', gap: 16, overflow: 'hidden' },
  avatar: { width: 78, height: 78, borderRadius: 39, backgroundColor: colors.ink, alignItems: 'center', justifyContent: 'center', zIndex: 2 },
  avatarImage: { width: 78, height: 78, borderRadius: 39 },
  initial: { color: colors.white, fontSize: 28, fontWeight: '800' },
  cameraBadge: { position: 'absolute', right: -2, bottom: -1, width: 30, height: 30, borderRadius: 15, backgroundColor: colors.white, borderWidth: 2, borderColor: colors.lavender, alignItems: 'center', justifyContent: 'center' },
  identity: { flex: 1, gap: 3, zIndex: 2 },
  name: { color: colors.ink, fontSize: 23, fontWeight: '900' },
  username: { color: colors.ink, fontSize: 14, fontWeight: '700' },
  email: { color: colors.ink, fontSize: 12, opacity: 0.65, marginTop: 3 },
  heroShape: { position: 'absolute', width: 98, height: 98, borderRadius: 32, backgroundColor: colors.pink, right: -32, top: -24, transform: [{ rotate: '24deg' }] },
  codeCard: { minHeight: 84, marginTop: 12, paddingHorizontal: 16, borderRadius: 24, backgroundColor: colors.orange, flexDirection: 'row', alignItems: 'center', gap: 12 },
  codeIcon: { width: 42, height: 42, borderRadius: 15, backgroundColor: '#FFFFFF88', alignItems: 'center', justifyContent: 'center' },
  codeCopy: { flex: 1, gap: 2 },
  codeLabel: { color: colors.ink, fontSize: 14, fontWeight: '800' },
  codeHint: { color: colors.ink, fontSize: 10, opacity: 0.65 },
  code: { color: colors.ink, fontSize: 11, fontWeight: '800', letterSpacing: 0.4 },
  sectionTitle: { color: colors.ink, fontSize: 20, fontWeight: '800', marginTop: 30, marginBottom: 10 },
  sectionCard: { backgroundColor: colors.surface, borderRadius: 24, borderWidth: 1, borderColor: colors.line, paddingHorizontal: 16, overflow: 'hidden' },
  publicSection: { paddingVertical: 18, gap: 14, backgroundColor: colors.blue, borderWidth: 0 },
  settingRow: { minHeight: 82, flexDirection: 'row', alignItems: 'center', gap: 12, borderBottomWidth: 1, borderBottomColor: colors.line },
  lastRow: { borderBottomWidth: 0 },
  settingIcon: { width: 42, height: 42, borderRadius: 15, backgroundColor: colors.paper, alignItems: 'center', justifyContent: 'center' },
  settingCopy: { flex: 1, gap: 3 },
  switchSlot: { width: 54, alignItems: 'center', justifyContent: 'center', marginRight: -4 },
  settingTitle: { color: colors.ink, fontSize: 15, fontWeight: '700' },
  settingDescription: { color: colors.muted, fontSize: 11, lineHeight: 15 },
  infoRow: { minHeight: 76, flexDirection: 'row', alignItems: 'center', gap: 12, borderTopWidth: 1, borderTopColor: colors.line },
  infoValue: { color: colors.muted, fontSize: 13, fontWeight: '600' },
  actionRow: { minHeight: 78, flexDirection: 'row', alignItems: 'center', gap: 12, borderBottomWidth: 1, borderBottomColor: colors.line },
  deleteRow: { minHeight: 82, flexDirection: 'row', alignItems: 'center', gap: 12 },
  deleteIcon: { width: 42, height: 42, borderRadius: 15, backgroundColor: '#FCE8E6', alignItems: 'center', justifyContent: 'center' },
  deleteTitle: { color: colors.danger, fontSize: 15, fontWeight: '700' },
  pressed: { opacity: 0.55 },
  modal: { flex: 1, justifyContent: 'flex-end' },
  scrim: { flex: 1, backgroundColor: '#00000077' },
  deleteSheet: { padding: 24, paddingTop: 28, paddingBottom: 36, gap: 16, backgroundColor: colors.paper, borderTopLeftRadius: 30, borderTopRightRadius: 30 },
  warningIcon: { width: 58, height: 58, borderRadius: 20, backgroundColor: '#FCE8E6', alignItems: 'center', justifyContent: 'center' },
  toastLayer: { flex: 1, justifyContent: 'flex-end', paddingHorizontal: 18, paddingBottom: 112 },
  toast: { minHeight: 58, paddingHorizontal: 18, borderRadius: 22, backgroundColor: colors.white, borderWidth: 1, borderColor: colors.line, flexDirection: 'row', alignItems: 'center', gap: 10, shadowColor: colors.ink, shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.14, shadowRadius: 18, elevation: 9 },
  toastText: { color: colors.ink, fontSize: 14, fontWeight: '700' },
});
