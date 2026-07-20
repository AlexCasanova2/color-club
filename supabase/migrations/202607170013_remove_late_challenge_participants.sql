delete from public.challenge_participants participant
using public.challenges challenge, public.club_members member
where participant.challenge_id = challenge.id
  and member.club_id = challenge.club_id
  and member.user_id = participant.user_id
  and challenge.status in ('configuring', 'active', 'voting')
  and member.joined_at > challenge.created_at;
