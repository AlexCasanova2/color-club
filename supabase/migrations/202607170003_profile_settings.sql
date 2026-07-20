alter table public.profiles
  add column challenge_notifications boolean not null default true,
  add column friend_notifications boolean not null default true,
  add column weekly_summary boolean not null default false,
  add column allow_friend_requests boolean not null default true,
  add column profile_discoverable boolean not null default true;

create or replace function public.find_profile_for_friend(search_term text)
returns table (
  id uuid,
  display_name text,
  username text,
  friend_code text,
  avatar_url text
)
language sql
stable
security definer set search_path = ''
as $$
  select p.id, p.display_name, p.username, p.friend_code, p.avatar_url
  from public.profiles p
  where p.id <> auth.uid()
    and p.profile_discoverable
    and (
      lower(p.username) = lower(ltrim(trim(search_term), '@'))
      or p.friend_code = upper(trim(search_term))
    )
  limit 1;
$$;

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
    return existing.id;
  end if;

  insert into public.friendships (requester_id, addressee_id)
  values (auth.uid(), target_user_id)
  returning id into friendship_id;
  return friendship_id;
end;
$$;

create or replace function public.delete_own_account(confirmation text)
returns void
language plpgsql
security definer set search_path = ''
as $$
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if confirmation <> 'BORRAR' then raise exception 'Confirmación inválida'; end if;
  delete from public.clubs where admin_id = auth.uid();
  delete from auth.users where id = auth.uid();
end;
$$;

revoke update on public.profiles from authenticated;
grant update (
  display_name,
  avatar_url,
  username,
  challenge_notifications,
  friend_notifications,
  weekly_summary,
  allow_friend_requests,
  profile_discoverable
) on public.profiles to authenticated;
grant execute on function public.delete_own_account(text) to authenticated;
