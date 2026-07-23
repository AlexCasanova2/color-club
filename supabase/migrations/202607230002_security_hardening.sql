drop policy if exists "members download visible collage objects" on storage.objects;

create policy "members download visible collage objects" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'collages'
    and exists (
      select 1
      from public.photos p
      join public.challenge_participants cp on cp.id = p.participant_id
      join public.challenges c on c.id = cp.challenge_id
      where p.photo_url = name
        and c.status in ('voting', 'closed')
        and public.is_active_club_member(c.club_id)
    )
  );

create or replace function public.transfer_club_admin(target_club_id uuid, new_admin_user_id uuid)
returns void
language plpgsql
security definer set search_path = ''
as $$
declare previous_admin_user_id uuid;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;

  select admin_id into previous_admin_user_id
  from public.clubs
  where id = target_club_id;

  if previous_admin_user_id is null then raise exception 'Grupo no encontrado'; end if;
  if previous_admin_user_id <> auth.uid() then raise exception 'Solo el propietario puede transferir el grupo'; end if;
  if new_admin_user_id = previous_admin_user_id then raise exception 'Ya eres el propietario del grupo'; end if;
  if not public.is_active_club_member(target_club_id, new_admin_user_id) then raise exception 'El nuevo admin debe ser miembro activo'; end if;

  update public.club_members
  set role = 'member'
  where club_id = target_club_id and user_id = previous_admin_user_id;

  update public.clubs
  set admin_id = new_admin_user_id
  where id = target_club_id;

  update public.club_members
  set role = 'admin'
  where club_id = target_club_id and user_id = new_admin_user_id;
end;
$$;

revoke all on function public.transfer_club_admin(uuid, uuid) from public, anon;
grant execute on function public.transfer_club_admin(uuid, uuid) to authenticated;

drop function if exists public.find_profile_for_friend(text);

create function public.find_profile_for_friend(search_term text)
returns table (
  id uuid,
  display_name text,
  username text,
  avatar_url text
)
language sql
stable
security definer set search_path = ''
as $$
  select p.id, p.display_name, p.username, p.avatar_url
  from public.profiles p
  where auth.uid() is not null
    and p.id <> auth.uid()
    and p.profile_discoverable
    and (
      lower(p.username) = lower(ltrim(trim(search_term), '@'))
      or p.friend_code = upper(trim(search_term))
    )
  limit 1;
$$;

revoke all on function public.find_profile_for_friend(text) from public, anon;
grant execute on function public.find_profile_for_friend(text) to authenticated;

create or replace function public.invite_user_to_club(target_club_id uuid, search_term text)
returns uuid
language plpgsql
security definer set search_path = ''
as $$
declare
  target_user_id uuid;
  membership_id uuid;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if not public.is_active_club_member(target_club_id) then raise exception 'No puedes invitar a este club'; end if;
  if not exists (select 1 from public.clubs where id = target_club_id and invites_enabled) then raise exception 'Las invitaciones están pausadas'; end if;

  select p.id into target_user_id
  from public.profiles p
  where p.profile_discoverable
    and (
      p.friend_code = upper(trim(search_term))
      or (
        lower(p.username) = lower(ltrim(trim(search_term), '@'))
        and exists (
          select 1
          from public.friendships f
          where f.status = 'accepted'
            and (
              (f.requester_id = auth.uid() and f.addressee_id = p.id)
              or (f.addressee_id = auth.uid() and f.requester_id = p.id)
            )
        )
      )
    );

  if target_user_id is null then raise exception 'Usa el código de amistad o invita a una amistad aceptada'; end if;
  if target_user_id = auth.uid() then raise exception 'Ya formas parte del club'; end if;

  insert into public.club_members (club_id, user_id, status)
  values (target_club_id, target_user_id, 'active')
  on conflict (club_id, user_id) do update set status = 'active'
  returning id into membership_id;

  return membership_id;
end;
$$;

revoke all on function public.invite_user_to_club(uuid, text) from public, anon;
grant execute on function public.invite_user_to_club(uuid, text) to authenticated;

create or replace function public.save_push_token(target_token text, target_platform text)
returns void
language plpgsql
security definer set search_path = ''
as $$
declare clean_token text := trim(target_token);
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if target_platform not in ('ios', 'android', 'web') then raise exception 'Plataforma inválida'; end if;
  if char_length(clean_token) > 255 or clean_token !~ '^Expo(nent)?PushToken\[[[:alnum:]_-]+\]$' then
    raise exception 'Token push inválido';
  end if;

  delete from public.push_tokens where token = clean_token;

  insert into public.push_tokens (user_id, token, platform)
  values (auth.uid(), clean_token, target_platform);
end;
$$;

revoke all on function public.save_push_token(text, text) from public, anon;
grant execute on function public.save_push_token(text, text) to authenticated;
