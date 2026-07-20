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

  select p.id into target_user_id
  from public.profiles p
  where p.profile_discoverable
    and (
      lower(p.username) = lower(ltrim(trim(search_term), '@'))
      or p.friend_code = upper(trim(search_term))
    );

  if target_user_id is null then raise exception 'No existe un usuario disponible con ese identificador'; end if;
  if target_user_id = auth.uid() then raise exception 'Ya formas parte del club'; end if;

  insert into public.club_members (club_id, user_id, status)
  values (target_club_id, target_user_id, 'active')
  on conflict (club_id, user_id) do update set status = 'active'
  returning id into membership_id;

  insert into public.challenge_participants (challenge_id, user_id)
  select c.id, target_user_id
  from public.challenges c
  where c.club_id = target_club_id and c.status in ('configuring', 'active')
  on conflict (challenge_id, user_id) do nothing;

  return membership_id;
end;
$$;

grant execute on function public.invite_user_to_club(uuid, text) to authenticated;
