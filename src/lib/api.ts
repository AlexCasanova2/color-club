import { decode } from 'base64-arraybuffer';
import { supabase } from '@/lib/supabase';
import type { ActivityItem, AppNotification, Challenge, Club, ClubMember, ClubMessage, DurationPreset, Friendship, Participant, Photo, Profile, RankingRow, Vote } from '@/types/domain';

function isJwtFutureError(error: { message: string } | null) {
  return error?.message.toLowerCase().includes('jwt issued at future') ?? false;
}

function fail(error: { message: string } | null) {
  if (!error) return;
  if (isJwtFutureError(error)) throw new Error('Tu sesión necesita actualizarse. Revisa que la hora del dispositivo esté en automático y vuelve a intentarlo.');
  throw new Error(error.message);
}

export async function getClubs(): Promise<Club[]> {
  const { data, error } = await supabase.from('clubs').select('*').order('created_at');
  fail(error);
  return (data ?? []) as Club[];
}

export async function getHomeDashboard(userId: string): Promise<{ clubs: Club[]; profile: Profile; challenge: (Challenge & { club_name: string; is_accessible: boolean }) | null }> {
  const firstAttempt = await getHomeDashboardData(userId);
  if (!firstAttempt.jwtFutureError) return firstAttempt.data;
  await supabase.auth.refreshSession();
  const secondAttempt = await getHomeDashboardData(userId);
  if (secondAttempt.jwtFutureError) throw new Error('Tu sesión necesita actualizarse. Revisa que la hora del dispositivo esté en automático y vuelve a intentarlo.');
  return secondAttempt.data;
}

async function getHomeDashboardData(userId: string): Promise<{ jwtFutureError: true; data?: never } | { jwtFutureError: false; data: { clubs: Club[]; profile: Profile; challenge: (Challenge & { club_name: string; is_accessible: boolean }) | null } }> {
  const [clubsResult, profileResult] = await Promise.all([
    supabase.from('clubs').select('*').order('created_at'),
    supabase.from('profiles').select('*').eq('id', userId).single(),
  ]);
  if (isJwtFutureError(clubsResult.error) || isJwtFutureError(profileResult.error)) return { jwtFutureError: true };
  fail(clubsResult.error);
  fail(profileResult.error);
  const clubs = (clubsResult.data ?? []) as Club[];
  if (!clubs.length) return { jwtFutureError: false, data: { clubs, profile: profileResult.data as Profile, challenge: null } };
  const challengeResult = await supabase
    .from('challenges')
    .select('*')
    .in('club_id', clubs.map((club) => club.id))
    .in('status', ['configuring', 'active', 'voting'])
    .order('created_at', { ascending: false })
    .limit(20);
  if (isJwtFutureError(challengeResult.error)) return { jwtFutureError: true };
  fail(challengeResult.error);
  const challenges = (challengeResult.data ?? []) as Challenge[];
  if (!challenges.length) return { jwtFutureError: false, data: { clubs, profile: profileResult.data as Profile, challenge: null } };
  const [participantResult, membershipResult] = await Promise.all([
    supabase
      .from('challenge_participants')
      .select('challenge_id')
      .in('challenge_id', challenges.map((item) => item.id))
      .eq('user_id', userId),
    supabase
      .from('club_members')
      .select('club_id,joined_at')
      .in('club_id', clubs.map((club) => club.id))
      .eq('user_id', userId)
      .eq('status', 'active'),
  ]);
  if (isJwtFutureError(participantResult.error) || isJwtFutureError(membershipResult.error)) return { jwtFutureError: true };
  fail(participantResult.error);
  fail(membershipResult.error);
  const challengeAccess = challenges.map((item) => {
    const membership = (membershipResult.data ?? []).find((entry) => entry.club_id === item.club_id);
    const joinedBeforeChallenge = membership?.joined_at ? new Date(membership.joined_at).getTime() <= new Date(item.created_at).getTime() : false;
    return {
      challenge: item,
      isAccessible: Boolean((participantResult.data ?? []).some((entry) => entry.challenge_id === item.id)) && joinedBeforeChallenge,
    };
  });
  const selected = challengeAccess.find((item) => item.isAccessible) ?? challengeAccess[0]!;
  return { jwtFutureError: false, data: {
    clubs,
    profile: profileResult.data as Profile,
    challenge: { ...selected.challenge, club_name: clubs.find((club) => club.id === selected.challenge.club_id)?.name ?? 'Tu club', is_accessible: selected.isAccessible },
  } };
}

export async function getActivity(userId: string): Promise<ActivityItem[]> {
  const participantResult = await supabase
    .from('challenge_participants')
    .select('challenge_id,status')
    .eq('user_id', userId);
  fail(participantResult.error);
  const participation = participantResult.data ?? [];
  if (!participation.length) return [];
  const challengeResult = await supabase
    .from('challenges')
    .select('*, clubs!challenges_club_id_fkey(name)')
    .in('id', participation.map((item) => item.challenge_id))
    .order('created_at', { ascending: false });
  fail(challengeResult.error);
  return (challengeResult.data ?? []).map((item) => {
    const club = item.clubs as unknown as { name: string };
    const ownParticipation = participation.find((entry) => entry.challenge_id === item.id)!;
    return {
      ...item,
      club_name: club.name,
      participant_status: ownParticipation.status,
    } as ActivityItem;
  });
}

export async function getNotifications(userId: string): Promise<AppNotification[]> {
  const { data, error } = await supabase
    .from('notifications')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(20);
  fail(error);
  return (data ?? []) as AppNotification[];
}

export async function getUnreadNotificationCount(userId: string): Promise<number> {
  const { count, error } = await supabase
    .from('notifications')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .is('read_at', null);
  fail(error);
  return count ?? 0;
}

export async function markNotificationRead(notificationId: string) {
  const { error } = await supabase.from('notifications').update({ read_at: new Date().toISOString() }).eq('id', notificationId);
  fail(error);
}

export async function getFriendships(): Promise<Friendship[]> {
  const { data, error } = await supabase
    .from('friendships')
    .select('*, requester:profiles!friendships_requester_id_fkey(*), addressee:profiles!friendships_addressee_id_fkey(*)')
    .neq('status', 'declined')
    .order('created_at', { ascending: false });
  fail(error);
  return (data ?? []) as unknown as Friendship[];
}

export async function sendFriendRequest(identifier: string) {
  const { error } = await supabase.rpc('send_friend_request', { search_term: identifier.trim() });
  fail(error);
}

export async function respondFriendRequest(requestId: string, accept: boolean) {
  const { error } = await supabase.rpc('respond_friend_request', { request_id: requestId, accept_request: accept });
  fail(error);
}

export async function removeFriendship(friendshipId: string) {
  const { error } = await supabase.rpc('remove_friendship', { friendship_id: friendshipId });
  fail(error);
}

export async function createClub(name: string, monthly: boolean) {
  const { data, error } = await supabase.rpc('create_club', {
    club_name: name,
    reset_mode: monthly ? 'monthly_auto' : 'manual',
  });
  fail(error);
  return data as string;
}

export async function joinClub(code: string) {
  const { data, error } = await supabase.rpc('join_club', { code });
  fail(error);
  return data as string;
}

export async function inviteUserToClub(clubId: string, identifier: string) {
  const { error } = await supabase.rpc('invite_user_to_club', {
    target_club_id: clubId,
    search_term: identifier.trim(),
  });
  fail(error);
}

export async function getClub(clubId: string, userId?: string): Promise<{ club: Club; challenge: Challenge | null; seasonId: string; ranking: RankingRow[]; myChallengeColor: string | null; isChallengeParticipant: boolean }> {
  const [clubResult, challengeResult, seasonResult] = await Promise.all([
    supabase.from('clubs').select('*').eq('id', clubId).single(),
    supabase.from('challenges').select('*').eq('club_id', clubId).order('created_at', { ascending: false }).limit(1).maybeSingle(),
    supabase.from('seasons').select('id').eq('club_id', clubId).eq('is_active', true).single(),
  ]);
  fail(clubResult.error);
  fail(challengeResult.error);
  fail(seasonResult.error);
  const seasonId = seasonResult.data!.id as string;
  const rankingResult = await supabase.from('season_ranking').select('*').eq('season_id', seasonId).order('position');
  fail(rankingResult.error);
  let myChallengeColor: string | null = null;
  let isChallengeParticipant = false;
  const challenge = challengeResult.data as Challenge | null;
  if (challenge && userId) {
    const [participantResult, membershipResult] = await Promise.all([
      supabase
        .from('challenge_participants')
        .select('assigned_color')
        .eq('challenge_id', challenge.id)
        .eq('user_id', userId)
        .maybeSingle(),
      supabase
        .from('club_members')
        .select('joined_at')
        .eq('club_id', clubId)
        .eq('user_id', userId)
        .eq('status', 'active')
        .maybeSingle(),
    ]);
    fail(participantResult.error);
    fail(membershipResult.error);
    const joinedBeforeChallenge = membershipResult.data?.joined_at ? new Date(membershipResult.data.joined_at).getTime() <= new Date(challenge.created_at).getTime() : false;
    isChallengeParticipant = Boolean(participantResult.data) && joinedBeforeChallenge;
    myChallengeColor = isChallengeParticipant ? participantResult.data?.assigned_color ?? null : null;
  }
  return {
    club: clubResult.data as Club,
    challenge,
    seasonId,
    ranking: (rankingResult.data ?? []) as RankingRow[],
    myChallengeColor,
    isChallengeParticipant,
  };
}

export async function getClubMembers(clubId: string): Promise<ClubMember[]> {
  const { data, error } = await supabase
    .from('club_members')
    .select('*, profiles!club_members_user_id_fkey(*)')
    .eq('club_id', clubId)
    .eq('status', 'active')
    .order('joined_at');
  fail(error);
  return (data ?? []) as unknown as ClubMember[];
}

export async function getMyClubMembership(clubId: string, userId: string): Promise<ClubMember | null> {
  const { data, error } = await supabase
    .from('club_members')
    .select('*, profiles!club_members_user_id_fkey(*)')
    .eq('club_id', clubId)
    .eq('user_id', userId)
    .eq('status', 'active')
    .maybeSingle();
  fail(error);
  return data as unknown as ClubMember | null;
}

export async function getClubMessages(clubId: string): Promise<ClubMessage[]> {
  const { data, error } = await supabase
    .from('club_messages')
    .select('*, profiles!club_messages_sender_id_fkey(*)')
    .eq('club_id', clubId)
    .order('created_at', { ascending: false })
    .limit(30);
  fail(error);
  return ((data ?? []) as unknown as ClubMessage[]).reverse();
}

export async function sendClubMessage(clubId: string, senderId: string, body: string) {
  const { error } = await supabase.from('club_messages').insert({ club_id: clubId, sender_id: senderId, body: body.trim() });
  fail(error);
}

export async function updateClubSettings(clubId: string, settings: {
  name: string;
  description: string;
  themeColor: string;
  invitesEnabled: boolean;
  challengeCreationPolicy: Club['challenge_creation_policy'];
  defaultDurationPreset: DurationPreset;
  defaultPhotoCount: number;
  chatEnabled: boolean;
}) {
  const { error } = await supabase.rpc('update_club_settings', {
    target_club_id: clubId,
    new_name: settings.name.trim(),
    new_description: settings.description.trim(),
    new_theme_color: settings.themeColor,
    new_invites_enabled: settings.invitesEnabled,
    new_challenge_creation_policy: settings.challengeCreationPolicy,
    new_default_duration_preset: settings.defaultDurationPreset,
    new_default_photo_count: settings.defaultPhotoCount,
    new_chat_enabled: settings.chatEnabled,
  });
  fail(error);
}

export async function updateClubName(clubId: string, name: string) {
  const { error } = await supabase.rpc('update_club_name', { target_club_id: clubId, new_name: name.trim() });
  fail(error);
}

export async function setClubMemberRole(membershipId: string, role: ClubMember['role']) {
  const { error } = await supabase.rpc('set_club_member_role', { target_membership_id: membershipId, new_role: role });
  fail(error);
}

export async function transferClubAdmin(clubId: string, newAdminUserId: string) {
  const { error } = await supabase.rpc('transfer_club_admin', { target_club_id: clubId, new_admin_user_id: newAdminUserId });
  fail(error);
}

export async function regenerateClubInviteCode(clubId: string): Promise<string> {
  const { data, error } = await supabase.rpc('regenerate_club_invite_code', { target_club_id: clubId });
  fail(error);
  return data as string;
}

export async function removeClubMember(membershipId: string) {
  const { error } = await supabase.rpc('remove_club_member', { target_membership_id: membershipId });
  fail(error);
}

export async function deleteCurrentChallenge(clubId: string) {
  const { error } = await supabase.rpc('delete_current_challenge', { target_club_id: clubId });
  fail(error);
}

export async function deleteClub(clubId: string, confirmation: string) {
  const { error } = await supabase.rpc('delete_club', { target_club_id: clubId, confirmation });
  fail(error);
}

export async function createChallenge(clubId: string, mode: 'shared_color' | 'individual_random', color: string, preset: DurationPreset, photoCount: number, colorSelectionMode: 'manual' | 'shared_random' | 'individual_random' = 'manual') {
  const { data, error } = mode === 'shared_color'
    ? await supabase.rpc('create_shared_challenge', {
      target_club_id: clubId,
      color,
      preset,
      begins_at: new Date().toISOString(),
      target_photo_count: photoCount,
      target_color_selection_mode: colorSelectionMode,
    })
    : await supabase.rpc('create_random_challenge', {
      target_club_id: clubId,
      preset,
      begins_at: new Date().toISOString(),
      target_photo_count: photoCount,
    });
  fail(error);
  return data as string;
}

export async function getChallenge(challengeId: string, userId: string) {
  const [challengeResult, participantsResult, votesResult] = await Promise.all([
    supabase.from('challenges').select('*').eq('id', challengeId).single(),
    supabase.from('challenge_participants').select('*, profiles!challenge_participants_user_id_fkey(*)').eq('challenge_id', challengeId).order('submitted_at'),
    supabase.from('votes').select('id,voter_id,voted_participant_id').eq('challenge_id', challengeId),
  ]);
  fail(challengeResult.error);
  fail(participantsResult.error);
  fail(votesResult.error);
  const challenge = challengeResult.data as Challenge;
  const membershipResult = await supabase
    .from('club_members')
    .select('joined_at')
    .eq('club_id', challenge.club_id)
    .eq('user_id', userId)
    .eq('status', 'active')
    .maybeSingle();
  fail(membershipResult.error);
  if (challenge.status !== 'closed' && (!membershipResult.data?.joined_at || new Date(membershipResult.data.joined_at).getTime() > new Date(challenge.created_at).getTime())) {
    throw new Error('Este reto ya estaba en curso cuando entraste al grupo. Podrás participar en el siguiente.');
  }
  const participants = (participantsResult.data ?? []) as unknown as Participant[];
  const ids = participants.map((participant) => participant.id);
  let photos: Photo[] = [];
  if (ids.length) {
    const photoResult = await supabase.from('photos').select('*').in('participant_id', ids).order('slot_order');
    fail(photoResult.error);
    photos = (photoResult.data ?? []) as Photo[];
  }
  const signed = await Promise.all(photos.map(async (photo) => {
    const { data } = await supabase.storage.from('collages').createSignedUrl(photo.photo_url, 3600);
    return { ...photo, storage_path: photo.photo_url, photo_url: data?.signedUrl ?? '' };
  }));
  return {
    challenge,
    participants: participants.map((participant) => ({
      ...participant,
      photos: signed.filter((photo) => photo.participant_id === participant.id),
    })),
    votes: (votesResult.data ?? []) as Vote[],
    votedParticipantId: ((votesResult.data ?? []).find((vote) => vote.voter_id === userId)?.voted_participant_id as string | undefined) ?? null,
  };
}

export async function uploadPhoto(participantId: string, slot: number, uri: string) {
  const response = await fetch(uri);
  const blob = await response.blob();
  const base64 = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = reject;
    reader.onload = () => resolve(String(reader.result).split(',')[1] ?? '');
    reader.readAsDataURL(blob);
  });
  const path = `${participantId}/${slot}-${Date.now()}.jpg`;
  const upload = await supabase.storage.from('collages').upload(path, decode(base64), {
    contentType: 'image/jpeg',
    upsert: true,
  });
  fail(upload.error);
  const result = await supabase.rpc('save_participant_photo', {
    target_participant_id: participantId,
    target_slot: slot,
    target_photo_url: path,
  });
  fail(result.error);
}

export async function submitCollage(participantId: string) {
  const { error } = await supabase.rpc('submit_collage', { target_participant_id: participantId });
  fail(error);
}

export async function deletePhoto(photoId: string, storagePath?: string) {
  if (storagePath) {
    const storage = await supabase.storage.from('collages').remove([storagePath]);
    fail(storage.error);
  }
  const { error } = await supabase.from('photos').delete().eq('id', photoId);
  fail(error);
}

export async function castVote(challengeId: string, participantId: string, userId: string) {
  const { error } = await supabase.from('votes').insert({
    challenge_id: challengeId,
    voted_participant_id: participantId,
    voter_id: userId,
  });
  fail(error);
}
