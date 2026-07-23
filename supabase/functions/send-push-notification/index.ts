type NotificationRecord = {
  id: string;
  user_id: string;
  type: string;
  title: string;
  body: string;
  related_club_id: string | null;
  related_challenge_id: string | null;
  related_user_id: string | null;
};

type PushToken = { token: string };

const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const webhookSecret = Deno.env.get('PUSH_WEBHOOK_SECRET');

function isNotificationRecord(value: unknown): value is NotificationRecord {
  if (!value || typeof value !== 'object') return false;
  const record = value as Partial<NotificationRecord>;
  return typeof record.user_id === 'string' && typeof record.title === 'string' && typeof record.body === 'string';
}

Deno.serve(async (request) => {
  if (request.method !== 'POST') return new Response('Method not allowed', { status: 405 });
  if (!supabaseUrl || !serviceRoleKey || !webhookSecret) return new Response('Missing function configuration', { status: 500 });
  if (request.headers.get('x-push-webhook-secret') !== webhookSecret) return new Response('Unauthorized', { status: 401 });

  const payload = await request.json().catch(() => null) as unknown;
  const maybeRecord = payload && typeof payload === 'object' && 'record' in payload ? (payload as { record?: unknown }).record : payload;
  if (!isNotificationRecord(maybeRecord)) return new Response('Invalid payload', { status: 400 });
  const notification = maybeRecord;

  const tokenResponse = await fetch(`${supabaseUrl}/rest/v1/push_tokens?select=token&user_id=eq.${notification.user_id}`, {
    headers: {
      apikey: serviceRoleKey,
      authorization: `Bearer ${serviceRoleKey}`,
    },
  });
  if (!tokenResponse.ok) return new Response('Could not load push tokens', { status: 500 });

  const tokens = await tokenResponse.json() as PushToken[];
  if (!tokens.length) return Response.json({ sent: 0 });

  const messages = tokens.map(({ token }) => ({
    to: token,
    title: notification.title,
    body: notification.body,
    sound: 'default',
    data: {
      notificationId: notification.id,
      type: notification.type,
      clubId: notification.related_club_id,
      challengeId: notification.related_challenge_id,
      userId: notification.related_user_id,
    },
  }));

  const expoResponse = await fetch('https://exp.host/--/api/v2/push/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(messages),
  });
  if (!expoResponse.ok) return new Response('Expo push request failed', { status: 502 });

  const result = await expoResponse.json();
  return Response.json({ sent: messages.length, result });
});
