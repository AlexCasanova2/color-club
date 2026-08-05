import { useEffect, useRef, useState } from 'react';
import { Animated, Linking, Modal, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Body, Button, ErrorText, Field, Screen, Title } from '@/components/ui';
import { colors } from '@/lib/theme';
import { supabase } from '@/lib/supabase';
import { emailConfirmationUrl, passwordRecoveryUrl } from '@/lib/authLinks';

const siteUrl = (process.env.EXPO_PUBLIC_SITE_URL ?? 'https://getcolorclub.com').replace(/\/$/, '');

export function AuthScreen() {
  const { height } = useWindowDimensions();
  const [isSignUp, setIsSignUp] = useState(false);
  const [isResettingPassword, setIsResettingPassword] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [rulesAccepted, setRulesAccepted] = useState(false);
  const [rulesOpen, setRulesOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const mode = isResettingPassword ? 'reset' : isSignUp ? 'signup' : 'login';
  const compact = height < 760;
  const tiny = height < 680;
  const formOpacity = useRef(new Animated.Value(1)).current;
  const formTranslateY = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    formOpacity.setValue(0);
    formTranslateY.setValue(12);
    Animated.parallel([
      Animated.timing(formOpacity, { toValue: 1, duration: 220, useNativeDriver: true }),
      Animated.spring(formTranslateY, { toValue: 0, damping: 20, mass: 0.7, stiffness: 170, useNativeDriver: true }),
    ]).start();
  }, [formOpacity, formTranslateY, mode]);

  function switchMode(next: 'login' | 'signup' | 'reset') {
    setError(null);
    setMessage(null);
    setIsResettingPassword(next === 'reset');
    setIsSignUp(next === 'signup');
  }

  async function submit() {
    setError(null);
    setMessage(null);
    if (!email.trim() || password.length < 6 || (isSignUp && (name.trim().length < 2 || !rulesAccepted))) {
      if (isSignUp && !rulesAccepted) { setError('Debes aceptar las normas de la comunidad para crear una cuenta.'); return; }
      setError('Revisa los datos. La contraseña debe tener al menos 6 caracteres.');
      return;
    }
    setLoading(true);
    const result = isSignUp
      ? await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: {
          emailRedirectTo: emailConfirmationUrl,
          data: { display_name: name.trim(), community_rules_accepted_at: new Date().toISOString() },
        },
      })
      : await supabase.auth.signInWithPassword({ email: email.trim(), password });
    setLoading(false);
    if (result.error) setError(result.error.message);
    else if (isSignUp && !result.data.session) setMessage('Revisa tu email para confirmar la cuenta.');
  }

  async function resetPassword() {
    setError(null);
    setMessage(null);
    if (!email.trim()) {
      setError('Escribe tu email para enviarte el enlace de recuperación.');
      return;
    }
    setLoading(true);
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: passwordRecoveryUrl });
    setLoading(false);
    if (resetError) setError(resetError.message);
    else setMessage('Te hemos enviado un enlace para recuperar tu contraseña.');
  }

  return (
    <Screen bottomInset={24}>
      <View style={[styles.wrap, compact && styles.wrapCompact, tiny && styles.wrapTiny]}>
        <View style={[styles.brandPanel, compact && styles.brandPanelCompact, tiny && styles.brandPanelTiny]}>
          <View style={styles.brandGlow} />
          <View style={styles.mark}>
            <View style={[styles.dot, { backgroundColor: colors.orange }]} />
            <View style={[styles.dot, { backgroundColor: colors.yellow }]} />
            <View style={[styles.dot, { backgroundColor: colors.ink }]} />
          </View>
          <View style={[styles.brandCopy, compact && styles.brandCopyCompact]}>
            <Title>{isResettingPassword ? 'Recupera acceso' : 'Color Club'}</Title>
            {!tiny && <Body>{isResettingPassword ? 'Te mandaremos un enlace seguro para volver a entrar.' : 'Un juego fotográfico para mirar con más atención junto a tus amigos.'}</Body>}
          </View>
          {!tiny && <View style={[styles.brandStack, compact && styles.brandStackCompact]}>
            <View style={[styles.brandCard, styles.brandCardOne]} />
            <View style={[styles.brandCard, styles.brandCardTwo]} />
            <View style={[styles.brandCard, styles.brandCardThree]} />
          </View>}
          <View style={styles.brandRing} />
        </View>
        <View style={styles.modeTabs}>
          <Pressable onPress={() => switchMode('login')} style={[styles.modeTab, mode === 'login' && styles.modeTabActive]}><Text style={[styles.modeText, mode === 'login' && styles.modeTextActive]}>Entrar</Text></Pressable>
          <Pressable onPress={() => switchMode('signup')} style={[styles.modeTab, mode === 'signup' && styles.modeTabActive]}><Text style={[styles.modeText, mode === 'signup' && styles.modeTextActive]}>Registro</Text></Pressable>
        </View>
        <Animated.View
          style={[styles.form, compact && styles.formCompact, { opacity: formOpacity, transform: [{ translateY: formTranslateY }] }]}
        >
          {!tiny && <View style={styles.formHeader}>
            <Text style={styles.formTitle}>{mode === 'reset' ? 'Nueva contraseña' : mode === 'signup' ? 'Crea tu cuenta' : 'Vuelve al club'}</Text>
            <Text style={styles.formSubtitle}>{mode === 'reset' ? 'Introduce tu email y revisa tu bandeja de entrada.' : mode === 'signup' ? 'Solo necesitas nombre, email y contraseña.' : 'Entra para ver tus retos activos.'}</Text>
          </View>}
          {isSignUp && !isResettingPassword && <Field label="Tu nombre" value={name} onChangeText={setName} autoCapitalize="words" />}
          <Field label="Email" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" autoCorrect={false} />
          {!isResettingPassword && <Field label="Contraseña" value={password} onChangeText={setPassword} secureTextEntry={!passwordVisible} rightElement={
            <Pressable accessibilityLabel={passwordVisible ? 'Ocultar contraseña' : 'Mostrar contraseña'} accessibilityRole="button" onPress={() => setPasswordVisible((visible) => !visible)} style={({ pressed }) => [styles.passwordToggle, pressed && styles.pressed]}>
              <Ionicons color={colors.ink} name={passwordVisible ? 'eye-off-outline' : 'eye-outline'} size={21} />
            </Pressable>
          } />}
          <ErrorText message={error} />
          {message && <Text style={styles.message}>{message}</Text>}
          {isSignUp && !isResettingPassword && <View style={styles.rulesRow}>
            <Pressable accessibilityLabel="Aceptar normas de la comunidad" accessibilityRole="checkbox" accessibilityState={{ checked: rulesAccepted }} onPress={() => setRulesAccepted((accepted) => !accepted)} style={[styles.checkbox, rulesAccepted && styles.checkboxChecked]}>{rulesAccepted && <Ionicons color={colors.white} name="checkmark" size={16} />}</Pressable>
            <Text style={styles.rulesText}>Acepto las <Text onPress={() => setRulesOpen(true)} style={styles.rulesLink}>normas de la comunidad</Text> y la política de tolerancia cero frente al abuso.</Text>
          </View>}
          <Button label={isResettingPassword ? 'Enviar enlace' : isSignUp ? 'Crear mi cuenta' : 'Entrar al club'} onPress={isResettingPassword ? resetPassword : submit} loading={loading} />
          {!isSignUp && !isResettingPassword && <Button label="He olvidado mi contraseña" onPress={() => switchMode('reset')} variant="quiet" />}
          {isResettingPassword && <Button label="Volver al inicio de sesión" onPress={() => switchMode('login')} variant="quiet" />}
        </Animated.View>
        <Modal animationType="fade" transparent visible={rulesOpen} onRequestClose={() => setRulesOpen(false)}>
          <View style={styles.rulesModalRoot}>
            <ScrollView contentContainerStyle={styles.rulesModalCard}>
              <Text style={styles.formTitle}>Normas de la comunidad</Text>
              <Text style={styles.rulesBody}>Color Club no permite acoso, amenazas, odio, contenido sexual, violencia, suplantación, spam ni compartir imágenes o datos de otras personas sin permiso.</Text>
              <Text style={styles.rulesBody}>Puedes denunciar perfiles, mensajes y collages, y bloquear a cualquier usuario. Revisamos las denuncias y podemos retirar contenido o suspender cuentas que incumplan estas reglas.</Text>
              <Button label="Entendido" onPress={() => setRulesOpen(false)} />
            </ScrollView>
          </View>
        </Modal>
        <View style={styles.legalLinks}>
          <Text onPress={() => void Linking.openURL(`${siteUrl}/privacidad`)} style={styles.legalLink}>Privacidad</Text>
          <Text onPress={() => void Linking.openURL(`${siteUrl}/terminos`)} style={styles.legalLink}>Términos</Text>
          <Text onPress={() => void Linking.openURL(`${siteUrl}/soporte`)} style={styles.legalLink}>Soporte</Text>
        </View>
      </View>
    </Screen>
  );
}

export function ResetPasswordScreen({ error: linkError, onComplete }: { error?: string | null; onComplete: () => void }) {
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [error, setError] = useState<string | null>(linkError ?? null);
  const [loading, setLoading] = useState(false);

  async function updatePassword() {
    if (password.length < 8) { setError('La contraseña debe tener al menos 8 caracteres.'); return; }
    if (password !== confirmation) { setError('Las contraseñas no coinciden.'); return; }
    setLoading(true);
    setError(null);
    const { error: updateError } = await supabase.auth.updateUser({ password });
    setLoading(false);
    if (updateError) setError(updateError.message);
    else onComplete();
  }

  return (
    <Screen bottomInset={24}>
      <View style={styles.resetWrap}>
        <View style={styles.mark}>
          <View style={[styles.dot, { backgroundColor: colors.orange }]} />
          <View style={[styles.dot, { backgroundColor: colors.yellow }]} />
          <View style={[styles.dot, { backgroundColor: colors.ink }]} />
        </View>
        <View style={styles.formHeader}>
          <Text style={styles.formTitle}>Crea una contraseña nueva</Text>
          <Text style={styles.formSubtitle}>Usa al menos 8 caracteres y no reutilices una contraseña anterior.</Text>
        </View>
        <Field label="Nueva contraseña" value={password} onChangeText={setPassword} secureTextEntry />
        <Field label="Repite la contraseña" value={confirmation} onChangeText={setConfirmation} secureTextEntry />
        <ErrorText message={error} />
        <Button label="Guardar contraseña" onPress={() => void updatePassword()} loading={loading} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  resetWrap: { flex: 1, justifyContent: 'center', gap: 18, paddingVertical: 24 },
  rulesRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  checkbox: { width: 24, height: 24, borderRadius: 8, borderWidth: 2, borderColor: colors.ink, alignItems: 'center', justifyContent: 'center' },
  checkboxChecked: { backgroundColor: colors.ink },
  rulesText: { flex: 1, color: colors.muted, fontSize: 13, lineHeight: 19 },
  rulesLink: { color: colors.ink, fontWeight: '900', textDecorationLine: 'underline' },
  rulesModalRoot: { flex: 1, backgroundColor: '#111217B8', justifyContent: 'center', padding: 20 },
  rulesModalCard: { borderRadius: 34, backgroundColor: colors.paper, padding: 24, gap: 16 },
  rulesBody: { color: colors.ink, fontSize: 15, lineHeight: 23 },
  legalLinks: { flexDirection: 'row', justifyContent: 'center', gap: 18 },
  legalLink: { color: colors.muted, fontSize: 12, fontWeight: '800', textDecorationLine: 'underline' },
  wrap: { flex: 1, justifyContent: 'center', gap: 18, paddingVertical: 24 },
  wrapCompact: { gap: 12, paddingVertical: 12 },
  wrapTiny: { justifyContent: 'flex-start', paddingVertical: 8 },
  brandPanel: { minHeight: 286, padding: 24, borderRadius: 34, backgroundColor: colors.lavender, overflow: 'hidden', justifyContent: 'space-between' },
  brandPanelCompact: { minHeight: 218, padding: 18, borderRadius: 30 },
  brandPanelTiny: { minHeight: 132, padding: 16, borderRadius: 26 },
  brandGlow: { position: 'absolute', width: 190, height: 190, borderRadius: 70, backgroundColor: colors.pink, right: -70, top: -52, transform: [{ rotate: '18deg' }] },
  brandCopy: { zIndex: 2, maxWidth: '78%', gap: 4 },
  brandCopyCompact: { maxWidth: '86%' },
  mark: { flexDirection: 'row', gap: 5 },
  dot: { width: 12, height: 12, borderRadius: 6 },
  brandStack: { position: 'absolute', right: 24, bottom: 28, width: 124, height: 118 },
  brandStackCompact: { transform: [{ scale: 0.78 }], right: 4, bottom: 8 },
  brandCard: { position: 'absolute', width: 82, height: 82, borderRadius: 28, borderWidth: 7, borderColor: '#FFFFFF88' },
  brandCardOne: { right: 0, top: 0, backgroundColor: colors.orange, transform: [{ rotate: '14deg' }] },
  brandCardTwo: { left: 8, top: 27, backgroundColor: colors.blue, transform: [{ rotate: '-12deg' }] },
  brandCardThree: { right: 18, bottom: 0, backgroundColor: colors.green, transform: [{ rotate: '8deg' }] },
  brandRing: { position: 'absolute', right: -24, bottom: -18, width: 134, height: 134, borderRadius: 67, borderWidth: 30, borderColor: colors.yellow, transform: [{ rotate: '-18deg' }] },
  modeTabs: { flexDirection: 'row', padding: 5, borderRadius: 24, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line },
  modeTab: { flex: 1, minHeight: 46, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  modeTabActive: { backgroundColor: colors.ink },
  modeText: { color: colors.muted, fontSize: 14, fontWeight: '800' },
  modeTextActive: { color: colors.white },
  form: { gap: 14, padding: 18, borderRadius: 30, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line },
  formCompact: { gap: 10, padding: 14, borderRadius: 26 },
  formHeader: { gap: 4, marginBottom: 2 },
  formTitle: { color: colors.ink, fontSize: 24, fontWeight: '900', letterSpacing: -0.6 },
  formSubtitle: { color: colors.muted, fontSize: 13, lineHeight: 18 },
  passwordToggle: { width: 42, height: 42, borderRadius: 15, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.paper },
  pressed: { opacity: 0.65 },
  message: { color: colors.green, lineHeight: 20, fontWeight: '700' },
});
