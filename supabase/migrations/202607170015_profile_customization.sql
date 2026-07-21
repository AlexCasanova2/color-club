alter table public.profiles
  add column bio text not null default '' check (char_length(bio) <= 120),
  add column favorite_color text not null default '#E84A3C',
  add column status_text text not null default '' check (char_length(status_text) <= 40),
  add column preferred_photo_source text not null default 'camera' check (preferred_photo_source in ('camera', 'library')),
  add column avatar_color text not null default '#111217',
  add column ranking_display_name text not null default 'display_name' check (ranking_display_name in ('display_name', 'username'));

grant update (
  bio,
  favorite_color,
  status_text,
  preferred_photo_source,
  avatar_color,
  ranking_display_name
) on public.profiles to authenticated;
