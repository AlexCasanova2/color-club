create or replace function public.submit_collage(target_participant_id uuid)
returns void
language plpgsql
security definer set search_path = ''
as $$
declare
  target_challenge_id uuid;
  required_photos smallint;
begin
  select cp.challenge_id, c.photo_count into target_challenge_id, required_photos
  from public.challenge_participants cp
  join public.challenges c on c.id = cp.challenge_id
  where cp.id = target_participant_id and cp.user_id = auth.uid()
    and cp.status = 'pending' and c.status = 'active' and c.ends_at > now();
  if target_challenge_id is null then raise exception 'El collage ya no se puede enviar'; end if;
  if (select count(*) from public.photos where participant_id = target_participant_id) <> required_photos then
    raise exception 'El collage debe tener exactamente % fotos', required_photos;
  end if;

  update public.challenge_participants
  set status = 'submitted', submitted_at = now()
  where id = target_participant_id;
end;
$$;

create or replace function public.advance_challenge(target_challenge_id uuid)
returns void
language plpgsql
security definer set search_path = ''
as $$
declare
  target_club_id uuid;
  submitted_count integer;
begin
  select club_id into target_club_id from public.challenges where id = target_challenge_id;
  if target_club_id is null then raise exception 'Reto no encontrado'; end if;
  if not public.is_active_club_member(target_club_id) then raise exception 'No tienes acceso a este reto'; end if;

  update public.challenges
  set status = 'active'
  where id = target_challenge_id and status = 'configuring' and starts_at <= now();

  update public.challenge_participants cp
  set status = 'disqualified'
  where cp.status = 'pending'
    and exists (
      select 1 from public.challenges c
      where c.id = target_challenge_id
        and c.id = cp.challenge_id
        and c.status = 'active'
        and c.ends_at <= now()
    );

  select count(*)
  into submitted_count
  from public.challenge_participants
  where challenge_id = target_challenge_id and status = 'submitted';

  update public.challenges
  set status = case when submitted_count <= 2 then 'closed'::public.challenge_status else 'voting'::public.challenge_status end,
      voting_ends_at = case when submitted_count <= 2 then null else ends_at + interval '24 hours' end
  where id = target_challenge_id and status = 'active' and ends_at <= now();

  update public.challenges
  set status = 'closed'
  where id = target_challenge_id and status = 'voting' and voting_ends_at <= now();
end;
$$;

create or replace function public.advance_challenges()
returns void
language plpgsql
security definer set search_path = ''
as $$
begin
  update public.challenges set status = 'active'
  where status = 'configuring' and starts_at <= now();

  update public.challenge_participants cp set status = 'disqualified'
  where cp.status = 'pending' and exists (
    select 1 from public.challenges c where c.id = cp.challenge_id and c.status = 'active' and c.ends_at <= now()
  );

  update public.challenges c
  set status = 'closed', voting_ends_at = null
  where c.status = 'active' and c.ends_at <= now()
    and (select count(*) from public.challenge_participants cp where cp.challenge_id = c.id and cp.status = 'submitted') <= 2;

  update public.challenges c
  set status = 'voting', voting_ends_at = c.ends_at + interval '24 hours'
  where c.status = 'active' and c.ends_at <= now();

  update public.challenges set status = 'closed'
  where status = 'voting' and voting_ends_at <= now();
end;
$$;

create or replace function public.validate_vote()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
declare target_owner uuid;
begin
  if new.voter_id <> auth.uid() then raise exception 'Votante inválido'; end if;
  select user_id into target_owner from public.challenge_participants
  where id = new.voted_participant_id and challenge_id = new.challenge_id and status = 'submitted';
  if target_owner is null then raise exception 'Participante no votable'; end if;
  if target_owner = new.voter_id then raise exception 'No puedes votarte a ti mismo'; end if;
  if not exists (
    select 1 from public.challenges c
    join public.challenge_participants cp on cp.challenge_id = c.id
    where c.id = new.challenge_id and c.status = 'voting' and c.voting_ends_at > now()
      and cp.user_id = new.voter_id and cp.status = 'submitted'
  ) then raise exception 'La votación está cerrada'; end if;
  return new;
end;
$$;

grant execute on function public.submit_collage(uuid) to authenticated;
grant execute on function public.advance_challenge(uuid) to authenticated;
revoke all on function public.advance_challenges() from public, anon, authenticated;
