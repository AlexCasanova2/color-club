create or replace function public.send_friend_request(search_term text)
returns uuid
language plpgsql
security definer set search_path = ''
as $$
declare
  target_user_id uuid;
  existing public.friendships%rowtype;
  friendship_id uuid;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  select p.id into target_user_id
  from public.profiles p
  where p.profile_discoverable
    and p.allow_friend_requests
    and (
      lower(p.username) = lower(ltrim(trim(search_term), '@'))
      or p.friend_code = upper(trim(search_term))
    );
  if target_user_id is null then raise exception 'No existe un usuario disponible con ese identificador'; end if;
  if target_user_id = auth.uid() then raise exception 'No puedes añadirte a ti mismo'; end if;

  select * into existing from public.friendships f
  where least(f.requester_id, f.addressee_id) = least(auth.uid(), target_user_id)
    and greatest(f.requester_id, f.addressee_id) = greatest(auth.uid(), target_user_id);

  if existing.id is not null then
    if existing.status = 'accepted' then raise exception 'Ya sois amigos'; end if;
    if existing.status = 'pending' and existing.requester_id = auth.uid() then return existing.id; end if;
    if existing.status = 'pending' and existing.addressee_id = auth.uid() then
      update public.friendships set status = 'accepted', responded_at = now() where id = existing.id;
      return existing.id;
    end if;
    update public.friendships
    set requester_id = auth.uid(), addressee_id = target_user_id, status = 'pending', created_at = now(), responded_at = null
    where id = existing.id;
    friendship_id := existing.id;
  else
    insert into public.friendships (requester_id, addressee_id)
    values (auth.uid(), target_user_id)
    returning id into friendship_id;
  end if;

  insert into public.notifications (user_id, type, title, body, related_user_id)
  select target_user_id, 'friend_request', 'Nueva solicitud de amistad', p.display_name || ' quiere añadirte en Color Club.', auth.uid()
  from public.profiles p
  join public.profiles target_profile on target_profile.id = target_user_id
  where p.id = auth.uid()
    and target_profile.friend_notifications;

  return friendship_id;
end;
$$;

create or replace function public.create_shared_challenge(
  target_club_id uuid,
  color text,
  preset public.duration_preset,
  begins_at timestamptz default now(),
  target_photo_count smallint default 6,
  target_color_selection_mode text default 'manual'
)
returns uuid
language plpgsql
security definer set search_path = ''
as $$
declare
  active_season_id uuid;
  new_challenge_id uuid;
  finish_at timestamptz;
  chosen_color text;
  previous_color text;
  available_colors text[] := array['#E84A3C', '#3157D5', '#F4C542', '#3A8D67', '#E75A9D', '#F27C38', '#7450A8', '#E9E6DF', '#30B7C2', '#9C6ADE', '#6B4F3A', '#111217'];
begin
  if not public.is_club_admin(target_club_id) then raise exception 'Solo el admin puede crear retos'; end if;
  if target_photo_count < 2 or target_photo_count > 12 then raise exception 'El reto debe tener entre 2 y 12 fotos'; end if;
  if target_color_selection_mode not in ('manual', 'shared_random') then raise exception 'Modo de color inválido'; end if;
  if exists (select 1 from public.challenges where club_id = target_club_id and status in ('active', 'voting')) then
    raise exception 'Ya hay un reto en curso';
  end if;
  if target_color_selection_mode = 'shared_random' then
    select shared_color into previous_color from public.challenges where club_id = target_club_id and shared_color is not null order by created_at desc limit 1;
    select item into chosen_color from unnest(available_colors) as item where item <> coalesce(previous_color, '') order by random() limit 1;
  else
    chosen_color := color;
  end if;
  select id into active_season_id from public.seasons where club_id = target_club_id and is_active;
  finish_at := begins_at + public.duration_to_interval(preset);
  insert into public.challenges (club_id, season_id, mode, shared_color, duration_preset, photo_count, color_selection_mode, starts_at, ends_at, status, created_by)
  values (target_club_id, active_season_id, 'shared_color', chosen_color, preset, target_photo_count, target_color_selection_mode, begins_at, finish_at, case when begins_at <= now() then 'active'::public.challenge_status else 'configuring'::public.challenge_status end, auth.uid())
  returning id into new_challenge_id;
  insert into public.challenge_participants (challenge_id, user_id)
  select new_challenge_id, user_id from public.club_members where club_id = target_club_id and status = 'active';
  perform public.notify_club_challenge_created(new_challenge_id);
  return new_challenge_id;
end;
$$;

grant execute on function public.send_friend_request(text) to authenticated;
grant execute on function public.create_shared_challenge(uuid, text, public.duration_preset, timestamptz, smallint, text) to authenticated;

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
  repeat_record record;
  replacement_color text;
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
  insert into public.challenges (club_id, season_id, mode, shared_color, duration_preset, photo_count, color_selection_mode, starts_at, ends_at, status, created_by)
  values (target_club_id, active_season_id, 'individual_random', null, preset, target_photo_count, 'individual_random', begins_at, finish_at, case when begins_at <= now() then 'active'::public.challenge_status else 'configuring'::public.challenge_status end, auth.uid())
  returning id into new_challenge_id;
  insert into public.challenge_participants (challenge_id, user_id, assigned_color)
  select new_challenge_id, user_id, available_colors[row_number() over (order by random())]
  from public.club_members
  where club_id = target_club_id and status = 'active';
  for repeat_record in
    select current_participant.id, current_participant.assigned_color
    from public.challenge_participants current_participant
    join lateral (
      select previous_participant.assigned_color
      from public.challenge_participants previous_participant
      join public.challenges previous_challenge on previous_challenge.id = previous_participant.challenge_id
      where previous_participant.user_id = current_participant.user_id
        and previous_challenge.club_id = target_club_id
        and previous_challenge.id <> new_challenge_id
        and previous_challenge.mode = 'individual_random'
        and previous_participant.assigned_color is not null
      order by previous_challenge.created_at desc
      limit 1
    ) previous on previous.assigned_color = current_participant.assigned_color
    where current_participant.challenge_id = new_challenge_id
  loop
    select item into replacement_color
    from unnest(available_colors) as item
    where item <> repeat_record.assigned_color
      and not exists (select 1 from public.challenge_participants used where used.challenge_id = new_challenge_id and used.assigned_color = item)
    order by random()
    limit 1;
    if replacement_color is not null then
      update public.challenge_participants set assigned_color = replacement_color where id = repeat_record.id;
    end if;
  end loop;
  perform public.notify_club_challenge_created(new_challenge_id);
  return new_challenge_id;
end;
$$;

grant execute on function public.create_random_challenge(uuid, public.duration_preset, timestamptz, smallint) to authenticated;
