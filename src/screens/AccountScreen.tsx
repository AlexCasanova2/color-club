import { useEffect, useState } from 'react';
import { ActivityIndicator, Image, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { ToastOverlay } from '@/components/Toast';
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

export function AccountScreen({ userId, email, onEditProfile, onViewPublicProfile, toastMessage, onToastShown }: { userId: string; email: string; onEditProfile: () => void; onViewPublicProfile: () => void; toastMessage?: string | null; onToastShown?: () => void }) {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [toastKey, setToastKey] = useState(0);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteText, setDeleteText] = useState('');
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    void supabase.from('profiles').select('*').eq('id', userId).single().then(({ data, error: profileError }) => {
      if (profileError) setError(profileError.message);
      else setProfile(data as Profile);
    });
  }, [userId]);

  useEffect(() => {
    if (!toastMessage) return;
    showToast(toastMessage);
    onToastShown?.();
  }, [toastMessage, onToastShown]);

  async function copyFriendCode() {
    if (!profile) return;
    await Clipboard.setStringAsync(profile.friend_code);
    showToast('Código copiado al portapapeles.');
  }

  function showToast(text: string) {
    setToast(text);
    setToastKey((current) => current + 1);
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
            <View style={styles.avatar}>
              {profile.avatar_url ? <Image source={{ uri: profile.avatar_url }} style={styles.avatarImage} /> : <Text style={[styles.initial, { backgroundColor: profile.avatar_color ?? colors.ink }]}>{profile.display_name.charAt(0).toUpperCase()}</Text>}
            </View>
            <View style={styles.identity}><Text style={styles.name}>{profile.display_name}</Text><Text style={styles.username}>@{profile.username}</Text><Text style={styles.email}>{email}</Text></View>
            <View style={styles.heroShape} />
          </View>

          <Pressable accessibilityRole="button" accessibilityLabel="Copiar código público" onPress={copyFriendCode} style={({ pressed }) => [styles.codeCard, pressed && styles.pressed]}>
            <View style={styles.codeIcon}><Ionicons color={colors.ink} name="qr-code-outline" size={23} /></View>
            <View style={styles.codeCopy}><Text style={styles.codeLabel}>Código público</Text><Text style={styles.codeHint}>Tus amigos pueden encontrarte con él</Text></View>
            <Text style={styles.code}>{profile.friend_code}</Text>
            <Ionicons color={colors.ink} name="copy-outline" size={18} />
          </Pressable>

          <Pressable onPress={onEditProfile} style={({ pressed }) => [styles.editProfileCard, pressed && styles.pressed]}>
            <View style={styles.editProfileIcon}><Ionicons color={colors.ink} name="create-outline" size={22} /></View>
            <View style={styles.settingCopy}><Text style={styles.editProfileTitle}>Editar perfil</Text><Text style={styles.settingDescription}>Nombre, usuario y foto pública</Text></View>
            <Ionicons color={colors.ink} name="chevron-forward" size={19} />
          </Pressable>

          <Pressable onPress={onViewPublicProfile} style={({ pressed }) => [styles.publicProfileCard, pressed && styles.pressed]}>
            <View style={styles.editProfileIcon}><Ionicons color={colors.ink} name="person-circle-outline" size={22} /></View>
            <View style={styles.settingCopy}><Text style={styles.editProfileTitle}>Ver perfil público</Text><Text style={styles.settingDescription}>Previsualiza cómo te ven en Color Club</Text></View>
            <Ionicons color={colors.ink} name="chevron-forward" size={19} />
          </Pressable>

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
      <ToastOverlay message={toast} onHidden={() => setToast(null)} trigger={toastKey} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  heading: { marginTop: 24, marginBottom: 22, gap: 8 },
  loader: { marginTop: 60 },
  profileHero: { minHeight: 154, padding: 22, borderRadius: 30, backgroundColor: colors.lavender, flexDirection: 'row', alignItems: 'center', gap: 16, overflow: 'hidden' },
  avatar: { width: 78, height: 78, borderRadius: 39, backgroundColor: colors.ink, alignItems: 'center', justifyContent: 'center', zIndex: 2 },
  avatarImage: { width: 78, height: 78, borderRadius: 39 },
  initial: { width: 78, height: 78, borderRadius: 39, overflow: 'hidden', color: colors.white, fontSize: 28, lineHeight: 78, textAlign: 'center', fontWeight: '800' },
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
  editProfileCard: { minHeight: 84, marginTop: 12, paddingHorizontal: 16, borderRadius: 24, backgroundColor: colors.blue, flexDirection: 'row', alignItems: 'center', gap: 12 },
  publicProfileCard: { minHeight: 84, marginTop: 10, paddingHorizontal: 16, borderRadius: 24, backgroundColor: colors.green, flexDirection: 'row', alignItems: 'center', gap: 12 },
  editProfileIcon: { width: 42, height: 42, borderRadius: 15, backgroundColor: '#FFFFFF88', alignItems: 'center', justifyContent: 'center' },
  editProfileTitle: { color: colors.ink, fontSize: 15, fontWeight: '800' },
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
});
