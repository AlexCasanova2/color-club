create or replace function public.search_public_profiles(search_term text, limit_count integer default 6)
returns table (
  id uuid,
  display_name text,
  username text,
  avatar_url text,
  avatar_color text
)
language sql
stable
security definer set search_path = ''
as $$
  select p.id, p.display_name, p.username, p.avatar_url, p.avatar_color
  from public.profiles p
  where auth.uid() is not null
    and p.id <> auth.uid()
    and p.profile_discoverable
    and p.allow_friend_requests
    and char_length(trim(search_term)) >= 2
    and (
      lower(p.username) like lower(ltrim(trim(search_term), '@')) || '%'
      or p.display_name ilike '%' || trim(search_term) || '%'
      or p.friend_code = upper(trim(search_term))
    )
  order by
    case when lower(p.username) = lower(ltrim(trim(search_term), '@')) then 0 else 1 end,
    p.display_name
  limit least(greatest(limit_count, 1), 10);
$$;

revoke all on function public.search_public_profiles(text, integer) from public, anon;
grant execute on function public.search_public_profiles(text, integer) to authenticated;
