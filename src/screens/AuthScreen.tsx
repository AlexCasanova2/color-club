import { useState } from 'react';
import { KeyboardAvoidingView, Platform, StyleSheet, Text, View } from 'react-native';
import { Body, Button, ErrorText, Eyebrow, Field, Screen, Title } from '@/components/ui';
import { colors } from '@/lib/theme';
import { supabase } from '@/lib/supabase';

export function AuthScreen() {
  const [isSignUp, setIsSignUp] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function submit() {
    setError(null);
    setMessage(null);
    if (!email.trim() || password.length < 6 || (isSignUp && name.trim().length < 2)) {
      setError('Revisa los datos. La contraseña debe tener al menos 6 caracteres.');
      return;
    }
    setLoading(true);
    const result = isSignUp
      ? await supabase.auth.signUp({ email: email.trim(), password, options: { data: { display_name: name.trim() } } })
      : await supabase.auth.signInWithPassword({ email: email.trim(), password });
    setLoading(false);
    if (result.error) setError(result.error.message);
    else if (isSignUp && !result.data.session) setMessage('Revisa tu email para confirmar la cuenta.');
  }

  return (
    <Screen>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.wrap}>
        <View style={styles.mark}>
          <View style={[styles.dot, { backgroundColor: colors.coral }]} />
          <View style={[styles.dot, { backgroundColor: colors.yellow }]} />
          <View style={[styles.dot, { backgroundColor: colors.cobalt }]} />
        </View>
        <View>
          <Eyebrow>Un color. Seis fotos.</Eyebrow>
          <Title>Color{`\n`}Club</Title>
          <Body muted>Retos fotográficos para ese grupo de amigos que nunca se pone de acuerdo.</Body>
        </View>
        <View style={styles.form}>
          {isSignUp && <Field label="Tu nombre" value={name} onChangeText={setName} autoCapitalize="words" />}
          <Field label="Email" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" autoCorrect={false} />
          <Field label="Contraseña" value={password} onChangeText={setPassword} secureTextEntry />
          <ErrorText message={error} />
          {message && <Text style={styles.message}>{message}</Text>}
          <Button label={isSignUp ? 'Crear mi cuenta' : 'Entrar al club'} onPress={submit} loading={loading} />
          <Button
            label={isSignUp ? 'Ya tengo cuenta' : 'Crear una cuenta'}
            onPress={() => { setIsSignUp(!isSignUp); setError(null); }}
            variant="quiet"
          />
        </View>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, justifyContent: 'center', gap: 32, paddingTop: 20 },
  mark: { flexDirection: 'row', gap: 7 },
  dot: { width: 22, height: 22, borderRadius: 11 },
  form: { gap: 14 },
  message: { color: colors.green, lineHeight: 20 },
});
