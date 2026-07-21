import { useEffect, useState } from 'react';
import { ActivityIndicator, Image, Keyboard, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Body, ErrorText, Header, Screen, Title } from '@/components/ui';
import { getClub, getClubMessages, sendClubMessage } from '@/lib/api';
import { supabase } from '@/lib/supabase';
import { colors } from '@/lib/theme';
import type { Club, ClubMessage } from '@/types/domain';

export function ClubChatScreen({ clubId, userId, onBack }: { clubId: string; userId: string; onBack: () => void }) {
  const [club, setClub] = useState<Club | null>(null);
  const [messages, setMessages] = useState<ClubMessage[]>([]);
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [keyboardInset, setKeyboardInset] = useState(0);

  async function loadMessages() {
    try { setMessages(await getClubMessages(clubId)); setError(null); }
    catch (caught) { setError((caught as Error).message); }
  }

  useEffect(() => {
    void Promise.all([getClub(clubId, userId), getClubMessages(clubId)])
      .then(([clubData, messageData]) => { setClub(clubData.club); setMessages(messageData); setError(null); })
      .catch((caught) => setError((caught as Error).message))
      .finally(() => setLoading(false));
    const channel = supabase.channel(`club-chat-${clubId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'club_messages', filter: `club_id=eq.${clubId}` }, () => void loadMessages())
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [clubId, userId]);

  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const show = Keyboard.addListener(showEvent, (event) => setKeyboardInset(event.endCoordinates.height));
    const hide = Keyboard.addListener(hideEvent, () => setKeyboardInset(0));
    return () => { show.remove(); hide.remove(); };
  }, []);

  async function send() {
    if (!text.trim()) return;
    setSending(true);
    setError(null);
    try {
      await sendClubMessage(clubId, userId, text);
      setText('');
      await loadMessages();
    } catch (caught) { setError((caught as Error).message); }
    setSending(false);
  }

  if (loading) return <Screen stickyHeader bottomInset={28}><Header title="Chat" onBack={onBack} /><ActivityIndicator style={styles.loader} color={colors.coral} /></Screen>;

  return (
    <Screen stickyHeader bottomInset={28} scroll={false}>
      <Header title="Chat" onBack={onBack} />
      <View style={styles.heading}><Title>{club?.name ?? 'Grupo'}</Title><Body muted>Chat en vivo para integrantes del grupo.</Body></View>
      <ErrorText message={error} />
      <View style={styles.chatShell}>
        <ScrollView contentContainerStyle={styles.messageList} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          {messages.length === 0 ? <View style={styles.emptyChat}><Text style={styles.emptyChatTitle}>Aún no hay mensajes</Text><Text style={styles.emptyChatText}>Rompe el hielo antes del próximo reto.</Text></View> : messages.map((message) => {
            const mine = message.sender_id === userId;
            return (
              <View key={message.id} style={[styles.messageRow, mine && styles.messageRowMine]}>
                {!mine && <View style={styles.messageAvatar}>{message.profiles.avatar_url ? <Image source={{ uri: message.profiles.avatar_url }} style={styles.messageAvatarImage} /> : <Text style={[styles.messageInitial, { backgroundColor: message.profiles.avatar_color ?? colors.ink }]}>{message.profiles.display_name.charAt(0).toUpperCase()}</Text>}</View>}
                <View style={[styles.messageBubble, mine && styles.messageBubbleMine]}>
                  {!mine && <Text style={styles.messageName}>{message.profiles.display_name}</Text>}
                  <Text style={[styles.messageBody, mine && styles.messageBodyMine]}>{message.body}</Text>
                </View>
              </View>
            );
          })}
        </ScrollView>
        <View style={[styles.chatComposer, { marginBottom: keyboardInset ? keyboardInset + 3 : 12 }]}>
          <TextInput value={text} onChangeText={setText} placeholder="Escribe algo..." placeholderTextColor={colors.muted} style={styles.chatInput} maxLength={500} multiline />
          <Pressable disabled={!text.trim() || sending} onPress={() => void send()} style={[styles.chatSend, (!text.trim() || sending) && styles.chatSendDisabled]}>
            {sending ? <ActivityIndicator color={colors.ink} size="small" /> : <Ionicons color={colors.ink} name="send" size={18} />}
          </Pressable>
        </View>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  loader: { marginTop: 100 },
  heading: { marginTop: 24, marginBottom: 16, gap: 8 },
  chatShell: { flex: 1, gap: 12 },
  messageList: { flexGrow: 1, justifyContent: 'flex-end', gap: 10, paddingBottom: 4 },
  emptyChat: { minHeight: 180, borderRadius: 28, backgroundColor: colors.blue, alignItems: 'center', justifyContent: 'center', gap: 6, padding: 20 },
  emptyChatTitle: { color: colors.ink, fontSize: 20, fontWeight: '900' },
  emptyChatText: { color: colors.ink, opacity: 0.65, fontSize: 13 },
  messageRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 8 },
  messageRowMine: { justifyContent: 'flex-end' },
  messageAvatar: { width: 32, height: 32, borderRadius: 16, backgroundColor: colors.ink, alignItems: 'center', justifyContent: 'center' },
  messageAvatarImage: { width: 32, height: 32, borderRadius: 16 },
  messageInitial: { width: 32, height: 32, borderRadius: 16, overflow: 'hidden', color: colors.white, fontSize: 12, lineHeight: 32, textAlign: 'center', fontWeight: '800' },
  messageBubble: { maxWidth: '78%', paddingHorizontal: 14, paddingVertical: 11, borderRadius: 19, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line },
  messageBubbleMine: { backgroundColor: colors.ink, borderColor: colors.ink },
  messageName: { color: colors.muted, fontSize: 10, fontWeight: '800', marginBottom: 3 },
  messageBody: { color: colors.ink, fontSize: 15, lineHeight: 20, fontWeight: '600' },
  messageBodyMine: { color: colors.white },
  chatComposer: { minHeight: 58, marginBottom: 12, borderRadius: 24, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, flexDirection: 'row', alignItems: 'flex-end', padding: 7, gap: 8 },
  chatInput: { flex: 1, minHeight: 42, maxHeight: 112, paddingHorizontal: 12, paddingVertical: 10, color: colors.ink, fontSize: 15 },
  chatSend: { width: 44, height: 44, borderRadius: 17, backgroundColor: colors.green, alignItems: 'center', justifyContent: 'center' },
  chatSendDisabled: { opacity: 0.42 },
});
