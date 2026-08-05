import { createClient } from 'npm:@supabase/supabase-js@2.110.7';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

async function listAllPaths(client: ReturnType<typeof createClient>, bucket: string, prefix: string) {
  const paths: string[] = [];
  for (let offset = 0; ; offset += 100) {
    const { data, error } = await client.storage.from(bucket).list(prefix, { limit: 100, offset });
    if (error) throw error;
    const batch = (data ?? []).filter((item) => item.name && item.id).map((item) => `${prefix}/${item.name}`);
    paths.push(...batch);
    if ((data ?? []).length < 100) break;
  }
  return paths;
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return new Response('Method not allowed', { status: 405, headers: corsHeaders });

  let adminClient: ReturnType<typeof createClient> | null = null;
  let deletionId: string | null = null;
  let accountDeleted = false;
  try {
    const authorization = request.headers.get('Authorization');
    if (!authorization) throw new Error('Authentication required');
    const url = Deno.env.get('SUPABASE_URL');
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!url || !anonKey || !serviceKey) throw new Error('Server configuration missing');

    const userClient = createClient(url, anonKey, { global: { headers: { Authorization: authorization } } });
    adminClient = createClient(url, serviceKey, { auth: { persistSession: false } });
    const { data: { user }, error: userError } = await userClient.auth.getUser();
    if (userError || !user) throw new Error('Authentication required');

    const { data: ownedClubs, error: clubsError } = await adminClient.from('clubs').select('id').eq('admin_id', user.id);
    if (clubsError) throw clubsError;
    const ownedClubIds = (ownedClubs ?? []).map((club) => club.id);

    let participantQuery = adminClient.from('challenge_participants').select('id, challenges!inner(club_id)').eq('user_id', user.id);
    const { data: ownParticipants, error: ownParticipantsError } = await participantQuery;
    if (ownParticipantsError) throw ownParticipantsError;

    let clubParticipants: Array<{ id: string }> = [];
    if (ownedClubIds.length) {
      const result = await adminClient.from('challenge_participants').select('id, challenges!inner(club_id)').in('challenges.club_id', ownedClubIds);
      if (result.error) throw result.error;
      clubParticipants = (result.data ?? []) as Array<{ id: string }>;
    }

    const participantIds = [...new Set([...(ownParticipants ?? []), ...clubParticipants].map((participant) => participant.id))];
    const avatarPaths = await listAllPaths(adminClient, 'avatars', user.id);
    const collagePaths = (await Promise.all(participantIds.map((id) => listAllPaths(adminClient, 'collages', id)))).flat();

    deletionId = crypto.randomUUID();
    const cleanupRows = [
      ...avatarPaths.map((objectPath) => ({ deletion_id: deletionId, bucket: 'avatars', object_path: objectPath })),
      ...collagePaths.map((objectPath) => ({ deletion_id: deletionId, bucket: 'collages', object_path: objectPath })),
    ];
    if (cleanupRows.length) {
      const { error: queueError } = await adminClient.from('account_deletion_cleanup').upsert(cleanupRows, { onConflict: 'bucket,object_path' });
      if (queueError) throw queueError;
    }

    const { error: deleteError } = await userClient.rpc('delete_own_account', { confirmation: 'BORRAR' });
    if (deleteError) throw deleteError;
    accountDeleted = true;
    if (cleanupRows.length) {
      const { error: readyError } = await adminClient.from('account_deletion_cleanup').update({ ready: true }).eq('deletion_id', deletionId);
      if (readyError) throw readyError;
    }

    for (let index = 0; index < avatarPaths.length; index += 100) {
      const { error } = await adminClient.storage.from('avatars').remove(avatarPaths.slice(index, index + 100));
      if (error) throw error;
    }
    for (let index = 0; index < collagePaths.length; index += 100) {
      const { error } = await adminClient.storage.from('collages').remove(collagePaths.slice(index, index + 100));
      if (error) throw error;
    }
    if (deletionId) await adminClient.from('account_deletion_cleanup').delete().eq('deletion_id', deletionId);
    return new Response(JSON.stringify({ deleted: true }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (caught) {
    if (adminClient && deletionId && !accountDeleted) await adminClient.from('account_deletion_cleanup').delete().eq('deletion_id', deletionId);
    if (accountDeleted) {
      if (adminClient && deletionId) await adminClient.from('account_deletion_cleanup').update({ ready: true }).eq('deletion_id', deletionId);
      return new Response(JSON.stringify({ deleted: true, cleanupPending: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    return new Response(JSON.stringify({ error: caught instanceof Error ? caught.message : 'No se pudo borrar la cuenta' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
