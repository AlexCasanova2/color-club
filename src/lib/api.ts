import { decode } from 'base64-arraybuffer';
import { supabase } from '@/lib/supabase';
import type { ActivityItem, Challenge, Club, DurationPreset, Friendship, Participant, Photo, RankingRow, Vote } from '@/types/domain';

function fail(error: { message: string } | null) {
  if (error) throw new Error(error.message);
}

export async function getClubs(): Promise<Club[]> {
  const { data, error } = await supabase.from('clubs').select('*').order('created_at');
  fail(error);
  return (data ?? []) as Club[];
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

export async function getClub(clubId: string): Promise<{ club: Club; challenge: Challenge | null; seasonId: string; ranking: RankingRow[] }> {
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
  return {
    club: clubResult.data as Club,
    challenge: challengeResult.data as Challenge | null,
    seasonId,
    ranking: (rankingResult.data ?? []) as RankingRow[],
  };
}

export async function createChallenge(clubId: string, color: string, preset: DurationPreset) {
  const { data, error } = await supabase.rpc('create_shared_challenge', {
    target_club_id: clubId,
    color,
    preset,
    begins_at: new Date().toISOString(),
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
    return { ...photo, photo_url: data?.signedUrl ?? '' };
  }));
  return {
    challenge: challengeResult.data as Challenge,
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
  const path = `${participantId}/${slot}.jpg`;
  const upload = await supabase.storage.from('collages').upload(path, decode(base64), {
    contentType: 'image/jpeg',
    upsert: true,
  });
  fail(upload.error);
  const result = await supabase.from('photos').upsert(
    { participant_id: participantId, slot_order: slot, photo_url: path },
    { onConflict: 'participant_id,slot_order' },
  );
  fail(result.error);
}

export async function submitCollage(participantId: string) {
  const { error } = await supabase.rpc('submit_collage', { target_participant_id: participantId });
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
