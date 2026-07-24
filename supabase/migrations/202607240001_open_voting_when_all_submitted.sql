create or replace function public.advance_active_challenge(target_challenge_id uuid)
returns void
language plpgsql
security definer set search_path = ''
as $$
declare
  challenge_record record;
  submitted_count integer;
  transitioned_count integer;
begin
  select c.id, c.ends_at
  into challenge_record
  from public.challenges c
  where c.id = target_challenge_id and c.status = 'active'
  for update;

  if not found then return; end if;

  if challenge_record.ends_at <= now() then
    update public.challenge_participants
    set status = 'disqualified'
    where challenge_id = target_challenge_id and status = 'pending';
  elsif exists (
    select 1
    from public.challenge_participants
    where challenge_id = target_challenge_id and status = 'pending'
  ) then
    return;
  end if;

  select count(*) into submitted_count
  from public.challenge_participants
  where challenge_id = target_challenge_id and status = 'submitted';

  update public.challenges
  set status = case when submitted_count <= 2 then 'closed'::public.challenge_status else 'voting'::public.challenge_status end,
      voting_ends_at = case when submitted_count <= 2 then null else now() + interval '24 hours' end
  where id = target_challenge_id and status = 'active';
  get diagnostics transitioned_count = row_count;

  if transitioned_count > 0 then
    if submitted_count <= 2 then
      perform public.notify_challenge_closed(target_challenge_id);
    else
      perform public.notify_challenge_voting_opened(target_challenge_id);
    end if;
  end if;
end;
$$;

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
    and cp.status = 'pending' and c.status = 'active' and c.ends_at > now()
  for update of c;
  if target_challenge_id is null then raise exception 'El collage ya no se puede enviar'; end if;
  if (select count(*) from public.photos where participant_id = target_participant_id) <> required_photos then
    raise exception 'El collage debe tener exactamente % fotos', required_photos;
  end if;

  update public.challenge_participants
  set status = 'submitted', submitted_at = now()
  where id = target_participant_id;

  perform public.notify_collage_submitted(target_participant_id);
  perform public.advance_active_challenge(target_challenge_id);
end;
$$;

create or replace function public.advance_challenge(target_challenge_id uuid)
returns void
language plpgsql
security definer set search_path = ''
as $$
declare
  target_club_id uuid;
  activated_count integer;
  closed_count integer;
begin
  select club_id into target_club_id from public.challenges where id = target_challenge_id;
  if target_club_id is null then raise exception 'Reto no encontrado'; end if;
  if not public.is_active_club_member(target_club_id) then raise exception 'No tienes acceso a este reto'; end if;

  update public.challenges
  set status = 'active'
  where id = target_challenge_id and status = 'configuring' and starts_at <= now();
  get diagnostics activated_count = row_count;
  if activated_count > 0 then perform public.notify_challenge_started(target_challenge_id); end if;

  perform public.advance_active_challenge(target_challenge_id);

  update public.challenges set status = 'closed'
  where id = target_challenge_id and status = 'voting' and voting_ends_at <= now();
  get diagnostics closed_count = row_count;
  if closed_count > 0 then perform public.notify_challenge_closed(target_challenge_id); end if;
end;
$$;

create or replace function public.advance_challenges()
returns void
language plpgsql
security definer set search_path = ''
as $$
declare
  challenge_record record;
  activated_count integer;
  closed_count integer;
begin
  for challenge_record in
    select c.id
    from public.challenges c
    where (c.status = 'configuring' and c.starts_at <= now())
       or (c.status = 'active' and (
         c.ends_at <= now()
         or not exists (
           select 1 from public.challenge_participants cp
           where cp.challenge_id = c.id and cp.status = 'pending'
         )
       ))
       or (c.status = 'voting' and c.voting_ends_at <= now())
  loop
    update public.challenges
    set status = 'active'
    where id = challenge_record.id and status = 'configuring' and starts_at <= now();
    get diagnostics activated_count = row_count;
    if activated_count > 0 then perform public.notify_challenge_started(challenge_record.id); end if;

    perform public.advance_active_challenge(challenge_record.id);

    update public.challenges set status = 'closed'
    where id = challenge_record.id and status = 'voting' and voting_ends_at <= now();
    get diagnostics closed_count = row_count;
    if closed_count > 0 then perform public.notify_challenge_closed(challenge_record.id); end if;
  end loop;
end;
$$;

revoke all on function public.advance_active_challenge(uuid) from public, anon, authenticated;
revoke all on function public.advance_challenges() from public, anon, authenticated;
grant execute on function public.submit_collage(uuid) to authenticated;
grant execute on function public.advance_challenge(uuid) to authenticated;
