alter table public.notifications
  add column if not exists dedupe_key text;

create unique index if not exists notifications_user_dedupe_key_idx
  on public.notifications(user_id, dedupe_key)
  where dedupe_key is not null;

create or replace function public.insert_notification_once(
  target_user_id uuid,
  target_type text,
  target_title text,
  target_body text,
  target_related_club_id uuid default null,
  target_related_challenge_id uuid default null,
  target_related_user_id uuid default null,
  target_related_invite_id uuid default null,
  target_dedupe_key text default null
)
returns void
language plpgsql
security definer set search_path = ''
as $$
begin
  insert into public.notifications (user_id, type, title, body, related_club_id, related_challenge_id, related_user_id, related_invite_id, dedupe_key)
  values (target_user_id, target_type, target_title, target_body, target_related_club_id, target_related_challenge_id, target_related_user_id, target_related_invite_id, target_dedupe_key)
  on conflict (user_id, dedupe_key) where dedupe_key is not null do nothing;
end;
$$;

create or replace function public.notify_club_challenge_created(target_challenge_id uuid)
returns void
language plpgsql
security definer set search_path = ''
as $$
declare challenge_record record;
begin
  select c.id, c.club_id, c.created_by, c.status, c.starts_at, cl.name as club_name
  into challenge_record
  from public.challenges c
  join public.clubs cl on cl.id = c.club_id
  where c.id = target_challenge_id;

  if challenge_record.id is null then return; end if;

  insert into public.notifications (user_id, type, title, body, related_club_id, related_challenge_id, dedupe_key)
  select
    cm.user_id,
    'challenge',
    case when challenge_record.status = 'active' then 'Nuevo reto en ' || challenge_record.club_name else 'Reto programado en ' || challenge_record.club_name end,
    case when challenge_record.status = 'active' then 'El reto ya está en marcha. Entra para ver tu color y la cuenta atrás.' else 'Hay un reto preparado. Te avisaremos cuando empiece.' end,
    challenge_record.club_id,
    challenge_record.id,
    'challenge-created:' || challenge_record.id || ':' || cm.user_id
  from public.club_members cm
  join public.profiles p on p.id = cm.user_id
  where cm.club_id = challenge_record.club_id
    and cm.status = 'active'
    and cm.user_id <> challenge_record.created_by
    and p.challenge_notifications
  on conflict (user_id, dedupe_key) where dedupe_key is not null do nothing;
end;
$$;

create or replace function public.notify_challenge_started(target_challenge_id uuid)
returns void
language plpgsql
security definer set search_path = ''
as $$
declare challenge_record record;
begin
  select c.id, c.club_id, cl.name as club_name
  into challenge_record
  from public.challenges c
  join public.clubs cl on cl.id = c.club_id
  where c.id = target_challenge_id;

  if challenge_record.id is null then return; end if;

  insert into public.notifications (user_id, type, title, body, related_club_id, related_challenge_id, dedupe_key)
  select cm.user_id, 'challenge', 'Reto iniciado en ' || challenge_record.club_name, 'Ya puedes abrir el reto y empezar tu collage.', challenge_record.club_id, challenge_record.id, 'challenge-started:' || challenge_record.id || ':' || cm.user_id
  from public.club_members cm
  join public.profiles p on p.id = cm.user_id
  where cm.club_id = challenge_record.club_id and cm.status = 'active' and p.challenge_notifications
  on conflict (user_id, dedupe_key) where dedupe_key is not null do nothing;
end;
$$;

create or replace function public.notify_collage_submitted(target_participant_id uuid)
returns void
language plpgsql
security definer set search_path = ''
as $$
declare submitter_record record;
begin
  select cp.id, cp.user_id, cp.challenge_id, c.club_id, p.display_name, cl.name as club_name
  into submitter_record
  from public.challenge_participants cp
  join public.challenges c on c.id = cp.challenge_id
  join public.clubs cl on cl.id = c.club_id
  join public.profiles p on p.id = cp.user_id
  where cp.id = target_participant_id;

  if submitter_record.id is null then return; end if;

  insert into public.notifications (user_id, type, title, body, related_club_id, related_challenge_id, related_user_id, dedupe_key)
  select cm.user_id, 'challenge', submitter_record.display_name || ' ha enviado su collage', 'El reto de ' || submitter_record.club_name || ' sigue avanzando.', submitter_record.club_id, submitter_record.challenge_id, submitter_record.user_id, 'collage-submitted:' || submitter_record.id || ':' || cm.user_id
  from public.club_members cm
  join public.profiles p on p.id = cm.user_id
  where cm.club_id = submitter_record.club_id
    and cm.status = 'active'
    and cm.user_id <> submitter_record.user_id
    and p.challenge_notifications
  on conflict (user_id, dedupe_key) where dedupe_key is not null do nothing;
end;
$$;

create or replace function public.notify_challenge_voting_opened(target_challenge_id uuid)
returns void
language plpgsql
security definer set search_path = ''
as $$
declare challenge_record record;
begin
  select c.id, c.club_id, cl.name as club_name
  into challenge_record
  from public.challenges c
  join public.clubs cl on cl.id = c.club_id
  where c.id = target_challenge_id;

  if challenge_record.id is null then return; end if;

  insert into public.notifications (user_id, type, title, body, related_club_id, related_challenge_id, dedupe_key)
  select cp.user_id, 'challenge', 'Votación abierta', 'Ya puedes votar el mejor collage en ' || challenge_record.club_name || '.', challenge_record.club_id, challenge_record.id, 'challenge-voting:' || challenge_record.id || ':' || cp.user_id
  from public.challenge_participants cp
  join public.profiles p on p.id = cp.user_id
  where cp.challenge_id = challenge_record.id and cp.status = 'submitted' and p.challenge_notifications
  on conflict (user_id, dedupe_key) where dedupe_key is not null do nothing;
end;
$$;

create or replace function public.notify_challenge_closed(target_challenge_id uuid)
returns void
language plpgsql
security definer set search_path = ''
as $$
declare challenge_record record;
begin
  select c.id, c.club_id, cl.name as club_name
  into challenge_record
  from public.challenges c
  join public.clubs cl on cl.id = c.club_id
  where c.id = target_challenge_id;

  if challenge_record.id is null then return; end if;

  insert into public.notifications (user_id, type, title, body, related_club_id, related_challenge_id, dedupe_key)
  select cm.user_id, 'challenge', 'Resultado disponible', 'El reto de ' || challenge_record.club_name || ' ya tiene resultado.', challenge_record.club_id, challenge_record.id, 'challenge-closed:' || challenge_record.id || ':' || cm.user_id
  from public.club_members cm
  join public.profiles p on p.id = cm.user_id
  where cm.club_id = challenge_record.club_id and cm.status = 'active' and p.challenge_notifications
  on conflict (user_id, dedupe_key) where dedupe_key is not null do nothing;
end;
$$;

create or replace function public.create_challenge_deadline_notifications()
returns integer
language plpgsql
security definer set search_path = ''
as $$
declare inserted_count integer := 0;
begin
  insert into public.notifications (user_id, type, title, body, related_club_id, related_challenge_id, dedupe_key)
  select cp.user_id, 'challenge', 'Te quedan 2 horas', 'Aún puedes enviar tu collage antes de que termine el reto.', c.club_id, c.id, 'challenge-deadline-2h:' || c.id || ':' || cp.user_id
  from public.challenges c
  join public.challenge_participants cp on cp.challenge_id = c.id
  join public.profiles p on p.id = cp.user_id
  where c.status = 'active'
    and c.ends_at > now()
    and c.ends_at <= now() + interval '2 hours'
    and cp.status = 'pending'
    and p.challenge_notifications
  on conflict (user_id, dedupe_key) where dedupe_key is not null do nothing;

  get diagnostics inserted_count = row_count;
  return inserted_count;
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
    and cp.status = 'pending' and c.status = 'active' and c.ends_at > now();
  if target_challenge_id is null then raise exception 'El collage ya no se puede enviar'; end if;
  if (select count(*) from public.photos where participant_id = target_participant_id) <> required_photos then
    raise exception 'El collage debe tener exactamente % fotos', required_photos;
  end if;

  update public.challenge_participants
  set status = 'submitted', submitted_at = now()
  where id = target_participant_id;

  perform public.notify_collage_submitted(target_participant_id);
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
  activated_count integer;
  voting_count integer;
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

  select count(*) into submitted_count
  from public.challenge_participants
  where challenge_id = target_challenge_id and status = 'submitted';

  update public.challenges
  set status = case when submitted_count <= 2 then 'closed'::public.challenge_status else 'voting'::public.challenge_status end,
      voting_ends_at = case when submitted_count <= 2 then null else ends_at + interval '24 hours' end
  where id = target_challenge_id and status = 'active' and ends_at <= now();
  get diagnostics voting_count = row_count;
  if voting_count > 0 then
    if submitted_count <= 2 then perform public.notify_challenge_closed(target_challenge_id);
    else perform public.notify_challenge_voting_opened(target_challenge_id);
    end if;
  end if;

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
  submitted_count integer;
  activated_count integer;
  voting_count integer;
  closed_count integer;
begin
  for challenge_record in
    select id from public.challenges
    where status in ('configuring', 'active', 'voting')
      and (starts_at <= now() or ends_at <= now() or voting_ends_at <= now())
  loop
    update public.challenges
    set status = 'active'
    where id = challenge_record.id and status = 'configuring' and starts_at <= now();
    get diagnostics activated_count = row_count;
    if activated_count > 0 then perform public.notify_challenge_started(challenge_record.id); end if;

    update public.challenge_participants cp
    set status = 'disqualified'
    where cp.challenge_id = challenge_record.id
      and cp.status = 'pending'
      and exists (
        select 1 from public.challenges c
        where c.id = cp.challenge_id and c.status = 'active' and c.ends_at <= now()
      );

    select count(*) into submitted_count
    from public.challenge_participants
    where challenge_id = challenge_record.id and status = 'submitted';

    update public.challenges
    set status = case when submitted_count <= 2 then 'closed'::public.challenge_status else 'voting'::public.challenge_status end,
        voting_ends_at = case when submitted_count <= 2 then null else ends_at + interval '24 hours' end
    where id = challenge_record.id and status = 'active' and ends_at <= now();
    get diagnostics voting_count = row_count;
    if voting_count > 0 then
      if submitted_count <= 2 then perform public.notify_challenge_closed(challenge_record.id);
      else perform public.notify_challenge_voting_opened(challenge_record.id);
      end if;
    end if;

    update public.challenges set status = 'closed'
    where id = challenge_record.id and status = 'voting' and voting_ends_at <= now();
    get diagnostics closed_count = row_count;
    if closed_count > 0 then perform public.notify_challenge_closed(challenge_record.id); end if;
  end loop;
end;
$$;

revoke all on function public.insert_notification_once(uuid, text, text, text, uuid, uuid, uuid, uuid, text) from public, anon;
revoke all on function public.notify_challenge_started(uuid) from public, anon, authenticated;
revoke all on function public.notify_collage_submitted(uuid) from public, anon, authenticated;
revoke all on function public.notify_challenge_voting_opened(uuid) from public, anon, authenticated;
revoke all on function public.notify_challenge_closed(uuid) from public, anon, authenticated;
revoke all on function public.create_challenge_deadline_notifications() from public, anon, authenticated;
revoke all on function public.advance_challenges() from public, anon, authenticated;
grant execute on function public.submit_collage(uuid) to authenticated;
grant execute on function public.advance_challenge(uuid) to authenticated;
