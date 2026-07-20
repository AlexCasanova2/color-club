alter type public.duration_preset add value if not exists '30min';
alter type public.duration_preset add value if not exists '2h';
alter type public.duration_preset add value if not exists '6h';

alter table public.challenges
  add column photo_count smallint not null default 6 check (photo_count between 2 and 12);

alter table public.photos drop constraint if exists photos_slot_order_check;
alter table public.photos add constraint photos_slot_order_check check (slot_order between 1 and 12);

create or replace function public.duration_to_interval(preset public.duration_preset)
returns interval
language sql
immutable
as $$
  select case preset::text
    when '30min' then interval '30 minutes'
    when '2h' then interval '2 hours'
    when '6h' then interval '6 hours'
    when '24h' then interval '24 hours'
    when '48h' then interval '48 hours'
    else interval '7 days'
  end;
$$;

create or replace function public.create_shared_challenge(
  target_club_id uuid,
  color text,
  preset public.duration_preset,
  begins_at timestamptz default now(),
  target_photo_count smallint default 6
)
returns uuid
language plpgsql
security definer set search_path = ''
as $$
declare
  active_season_id uuid;
  new_challenge_id uuid;
  finish_at timestamptz;
begin
  if not public.is_club_admin(target_club_id) then raise exception 'Solo el admin puede crear retos'; end if;
  if target_photo_count < 2 or target_photo_count > 12 then raise exception 'El reto debe tener entre 2 y 12 fotos'; end if;
  if exists (select 1 from public.challenges where club_id = target_club_id and status in ('active', 'voting')) then
    raise exception 'Ya hay un reto en curso';
  end if;
  select id into active_season_id from public.seasons where club_id = target_club_id and is_active;
  finish_at := begins_at + public.duration_to_interval(preset);
  insert into public.challenges (
    club_id, season_id, mode, shared_color, duration_preset, photo_count, starts_at, ends_at, status, created_by
  ) values (
    target_club_id, active_season_id, 'shared_color', color, preset, target_photo_count, begins_at, finish_at,
    case when begins_at <= now() then 'active'::public.challenge_status else 'configuring'::public.challenge_status end,
    auth.uid()
  ) returning id into new_challenge_id;
  insert into public.challenge_participants (challenge_id, user_id)
  select new_challenge_id, user_id from public.club_members
  where club_id = target_club_id and status = 'active';
  return new_challenge_id;
end;
$$;

create or replace function public.create_random_challenge(
  target_club_id uuid,
  preset public.duration_preset,
  begins_at timestamptz default now(),
  target_photo_count smallint default 6
)
returns uuid
language plpgsql
security definer set search_path = ''
as $$
declare
  active_season_id uuid;
  new_challenge_id uuid;
  finish_at timestamptz;
  member_count integer;
  available_colors text[] := array['#E84A3C', '#3157D5', '#F4C542', '#3A8D67', '#E75A9D', '#F27C38', '#7450A8', '#E9E6DF', '#30B7C2', '#9C6ADE', '#6B4F3A', '#111217'];
begin
  if not public.is_club_admin(target_club_id) then raise exception 'Solo el admin puede crear retos'; end if;
  if target_photo_count < 2 or target_photo_count > 12 then raise exception 'El reto debe tener entre 2 y 12 fotos'; end if;
  select count(*) into member_count from public.club_members where club_id = target_club_id and status = 'active';
  if member_count > array_length(available_colors, 1) then raise exception 'Hay más participantes que colores únicos disponibles'; end if;
  if exists (select 1 from public.challenges where club_id = target_club_id and status in ('active', 'voting')) then
    raise exception 'Ya hay un reto en curso';
  end if;
  select id into active_season_id from public.seasons where club_id = target_club_id and is_active;
  finish_at := begins_at + public.duration_to_interval(preset);
  insert into public.challenges (
    club_id, season_id, mode, shared_color, duration_preset, photo_count, starts_at, ends_at, status, created_by
  ) values (
    target_club_id, active_season_id, 'individual_random', null, preset, target_photo_count, begins_at, finish_at,
    case when begins_at <= now() then 'active'::public.challenge_status else 'configuring'::public.challenge_status end,
    auth.uid()
  ) returning id into new_challenge_id;
  insert into public.challenge_participants (challenge_id, user_id, assigned_color)
  select new_challenge_id, user_id, available_colors[row_number() over (order by random())]
  from public.club_members
  where club_id = target_club_id and status = 'active';
  return new_challenge_id;
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
  update public.challenge_participants set status = 'submitted', submitted_at = now()
  where id = target_participant_id;
  if not exists (
    select 1 from public.challenge_participants where challenge_id = target_challenge_id and status = 'pending'
  ) then
    update public.challenges
    set status = 'voting', voting_ends_at = now() + interval '24 hours'
    where id = target_challenge_id and status = 'active';
  end if;
end;
$$;

grant execute on function public.create_shared_challenge(uuid, text, public.duration_preset, timestamptz, smallint) to authenticated;
grant execute on function public.create_random_challenge(uuid, public.duration_preset, timestamptz, smallint) to authenticated;
