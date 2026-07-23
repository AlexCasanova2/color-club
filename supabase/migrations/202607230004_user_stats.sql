create or replace function public.can_view_public_profile(target_user_id uuid, viewer_user_id uuid default auth.uid())
returns boolean
language sql
stable
security definer set search_path = ''
as $$
  select viewer_user_id is not null
    and (
      target_user_id = viewer_user_id
      or exists (
        select 1
        from public.club_members mine
        join public.club_members theirs on theirs.club_id = mine.club_id
        where mine.user_id = viewer_user_id
          and mine.status = 'active'
          and theirs.user_id = target_user_id
          and theirs.status = 'active'
      )
      or exists (
        select 1
        from public.friendships f
        where f.status = 'accepted'
          and (
            (f.requester_id = viewer_user_id and f.addressee_id = target_user_id)
            or (f.addressee_id = viewer_user_id and f.requester_id = target_user_id)
          )
      )
    );
$$;

create or replace function public.get_user_stats(target_user_id uuid)
returns table (
  total_challenges integer,
  submitted_collages integer,
  wins integer,
  best_challenge_position integer,
  best_season_position integer,
  seasons_played integer,
  votes_received integer,
  votes_cast integer
)
language sql
stable
security definer set search_path = ''
as $$
  with permission as (
    select public.can_view_public_profile(target_user_id) as allowed
  ),
  participant_stats as (
    select
      count(*) filter (where c.status <> 'configuring')::integer as total_challenges,
      count(*) filter (where cp.status = 'submitted')::integer as submitted_collages,
      count(distinct c.season_id)::integer as seasons_played
    from public.challenge_participants cp
    join public.challenges c on c.id = cp.challenge_id
    join permission p on p.allowed
    where cp.user_id = target_user_id
  ),
  challenge_scores as (
    select
      cp.challenge_id,
      cp.user_id,
      rank() over (partition by cp.challenge_id order by count(v.id) desc)::integer as position
    from public.challenge_participants cp
    join public.challenges c on c.id = cp.challenge_id
    join permission p on p.allowed
    left join public.votes v on v.voted_participant_id = cp.id
    where c.status = 'closed'
      and cp.status = 'submitted'
    group by cp.challenge_id, cp.user_id
  ),
  winner_stats as (
    select
      count(*) filter (where position = 1)::integer as wins,
      min(position)::integer as best_challenge_position
    from challenge_scores
    where user_id = target_user_id
  ),
  vote_stats as (
    select
      count(v.id) filter (where cp.user_id = target_user_id)::integer as votes_received,
      count(v.id) filter (where v.voter_id = target_user_id)::integer as votes_cast
    from permission p
    left join public.votes v on p.allowed
    left join public.challenge_participants cp on cp.id = v.voted_participant_id
  ),
  season_stats as (
    select min(position)::integer as best_season_position
    from public.season_ranking sr
    join permission p on p.allowed
    where sr.user_id = target_user_id
  )
  select
    coalesce(ps.total_challenges, 0),
    coalesce(ps.submitted_collages, 0),
    coalesce(ws.wins, 0),
    ws.best_challenge_position,
    ss.best_season_position,
    coalesce(ps.seasons_played, 0),
    coalesce(vs.votes_received, 0),
    coalesce(vs.votes_cast, 0)
  from permission p
  left join participant_stats ps on p.allowed
  left join winner_stats ws on p.allowed
  left join vote_stats vs on p.allowed
  left join season_stats ss on p.allowed
  where p.allowed;
$$;

revoke all on function public.can_view_public_profile(uuid, uuid) from public, anon;
grant execute on function public.can_view_public_profile(uuid, uuid) to authenticated;
revoke all on function public.get_user_stats(uuid) from public, anon;
grant execute on function public.get_user_stats(uuid) to authenticated;
