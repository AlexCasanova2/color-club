alter table public.profiles
  add column username text,
  add column friend_code text;

update public.profiles
set
  username = left(
    coalesce(nullif(regexp_replace(lower(display_name), '[^a-z0-9]+', '', 'g'), ''), 'user'),
    20
  ) || '_' || substr(replace(id::text, '-', ''), 1, 8),
  friend_code = 'CC-' || upper(substr(replace(id::text, '-', ''), 1, 12));

alter table public.profiles
  alter column username set not null,
  alter column friend_code set not null,
  add constraint valid_username check (username ~ '^[a-z0-9_]{3,32}$'),
  add constraint valid_friend_code check (friend_code ~ '^CC-[A-F0-9]{12}$');

create unique index profiles_username_unique on public.profiles(lower(username));
create unique index profiles_friend_code_unique on public.profiles(friend_code);

create type public.friendship_status as enum ('pending', 'accepted', 'declined');

create table public.friendships (
  id uuid primary key default gen_random_uuid(),
  requester_id uuid not null references public.profiles(id) on delete cascade,
  addressee_id uuid not null references public.profiles(id) on delete cascade,
  status public.friendship_status not null default 'pending',
  created_at timestamptz not null default now(),
  responded_at timestamptz,
  constraint cannot_friend_self check (requester_id <> addressee_id)
);

create unique index friendships_unique_pair on public.friendships(
  least(requester_id, addressee_id),
  greatest(requester_id, addressee_id)
);
create index friendships_requester_idx on public.friendships(requester_id, status);
create index friendships_addressee_idx on public.friendships(addressee_id, status);

alter table public.friendships enable row level security;

create policy "users read related friendships" on public.friendships
for select to authenticated
using (requester_id = auth.uid() or addressee_id = auth.uid());

create policy "connections read profiles" on public.profiles
for select to authenticated
using (
  exists (
    select 1 from public.friendships f
    where (f.requester_id = auth.uid() and f.addressee_id = profiles.id)
       or (f.addressee_id = auth.uid() and f.requester_id = profiles.id)
  )
);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
declare
  base_username text;
begin
  base_username := coalesce(
    nullif(regexp_replace(lower(new.raw_user_meta_data ->> 'display_name'), '[^a-z0-9]+', '', 'g'), ''),
    nullif(regexp_replace(lower(split_part(coalesce(new.email, ''), '@', 1)), '[^a-z0-9]+', '', 'g'), ''),
    'user'
  );
  if char_length(base_username) < 3 then base_username := 'user' || base_username; end if;
  insert into public.profiles (id, display_name, username, friend_code)
  values (
    new.id,
    coalesce(nullif(new.raw_user_meta_data ->> 'display_name', ''), split_part(coalesce(new.email, 'colorista'), '@', 1)),
    left(base_username, 20) || '_' || substr(replace(new.id::text, '-', ''), 1, 8),
    'CC-' || upper(substr(replace(new.id::text, '-', ''), 1, 12))
  );
  return new;
end;
$$;

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
  where lower(p.username) = lower(ltrim(trim(search_term), '@'))
     or p.friend_code = upper(trim(search_term));
  if target_user_id is null then raise exception 'No existe ningún usuario con ese identificador'; end if;
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

create or replace function public.respond_friend_request(request_id uuid, accept_request boolean)
returns void
language plpgsql
security definer set search_path = ''
as $$
begin
  update public.friendships
  set status = case when accept_request then 'accepted'::public.friendship_status else 'declined'::public.friendship_status end,
      responded_at = now()
  where id = request_id and addressee_id = auth.uid() and status = 'pending';
  if not found then raise exception 'Solicitud no disponible'; end if;
end;
$$;

create or replace function public.remove_friendship(friendship_id uuid)
returns void
language plpgsql
security definer set search_path = ''
as $$
begin
  delete from public.friendships
  where id = friendship_id and (requester_id = auth.uid() or addressee_id = auth.uid());
  if not found then raise exception 'Relación no disponible'; end if;
end;
$$;

revoke insert, update, delete on public.friendships from anon, authenticated;
grant select on public.friendships to authenticated;
revoke update on public.profiles from authenticated;
grant update (display_name, avatar_url, username) on public.profiles to authenticated;
grant execute on function public.find_profile_for_friend(text) to authenticated;
grant execute on function public.send_friend_request(text) to authenticated;
grant execute on function public.respond_friend_request(uuid, boolean) to authenticated;
grant execute on function public.remove_friendship(uuid) to authenticated;
