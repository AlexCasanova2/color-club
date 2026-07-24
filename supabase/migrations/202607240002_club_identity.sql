alter table public.clubs
  add column if not exists icon text not null default 'color-palette-outline';

alter table public.clubs drop constraint if exists clubs_icon_check;
alter table public.clubs
  add constraint clubs_icon_check check (icon in (
    'color-palette-outline',
    'camera-outline',
    'sparkles-outline',
    'people-outline',
    'heart-outline',
    'planet-outline',
    'sunny-outline',
    'flower-outline'
  ));

drop function if exists public.create_club(text, public.season_reset_mode);

create function public.create_club(
  club_name text,
  reset_mode public.season_reset_mode default 'manual',
  club_theme_color text default '#AC98FF',
  club_icon text default 'color-palette-outline'
)
returns uuid
language plpgsql
security definer set search_path = ''
as $$
declare new_club_id uuid;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if char_length(trim(club_name)) < 2 or char_length(trim(club_name)) > 50 then raise exception 'Nombre inválido'; end if;
  if club_theme_color not in ('#FFB94F', '#9FC5FF', '#F08CE8', '#62C79B', '#AC98FF', '#FFC455') then raise exception 'Color de club inválido'; end if;
  if club_icon not in ('color-palette-outline', 'camera-outline', 'sparkles-outline', 'people-outline', 'heart-outline', 'planet-outline', 'sunny-outline', 'flower-outline') then raise exception 'Icono de club inválido'; end if;

  insert into public.clubs (name, admin_id, season_reset_mode, theme_color, icon)
  values (trim(club_name), auth.uid(), reset_mode, club_theme_color, club_icon)
  returning id into new_club_id;
  insert into public.club_members (club_id, user_id, role) values (new_club_id, auth.uid(), 'admin');
  insert into public.seasons (club_id) values (new_club_id);
  return new_club_id;
end;
$$;

drop function if exists public.update_club_settings(uuid, text, text, text, boolean, text, public.duration_preset, smallint, boolean);

create function public.update_club_settings(
  target_club_id uuid,
  new_name text,
  new_description text,
  new_theme_color text,
  new_icon text,
  new_invites_enabled boolean,
  new_challenge_creation_policy text,
  new_default_duration_preset public.duration_preset,
  new_default_photo_count smallint,
  new_chat_enabled boolean
)
returns void
language plpgsql
security definer set search_path = ''
as $$
begin
  if not public.is_club_admin(target_club_id) then raise exception 'Solo un admin puede editar el grupo'; end if;
  if char_length(trim(new_name)) < 2 or char_length(trim(new_name)) > 50 then raise exception 'Nombre inválido'; end if;
  if new_theme_color not in ('#FFB94F', '#9FC5FF', '#F08CE8', '#62C79B', '#AC98FF', '#FFC455') then raise exception 'Color de club inválido'; end if;
  if new_icon not in ('color-palette-outline', 'camera-outline', 'sparkles-outline', 'people-outline', 'heart-outline', 'planet-outline', 'sunny-outline', 'flower-outline') then raise exception 'Icono de club inválido'; end if;
  if new_challenge_creation_policy not in ('admins', 'admins_moderators', 'all_members') then raise exception 'Permiso inválido'; end if;
  if new_default_photo_count < 2 or new_default_photo_count > 12 or new_default_photo_count % 2 <> 0 then raise exception 'Número de fotos inválido'; end if;

  update public.clubs
  set name = trim(new_name),
      description = nullif(trim(new_description), ''),
      theme_color = new_theme_color,
      icon = new_icon,
      invites_enabled = new_invites_enabled,
      challenge_creation_policy = new_challenge_creation_policy,
      default_duration_preset = new_default_duration_preset,
      default_photo_count = new_default_photo_count,
      chat_enabled = new_chat_enabled
  where id = target_club_id;
end;
$$;

create or replace function public.regenerate_club_invite_code(target_club_id uuid)
returns text
language plpgsql
security definer set search_path = ''
as $$
declare new_code text;
begin
  if not public.is_club_admin(target_club_id) then raise exception 'Solo un admin puede regenerar invitaciones'; end if;
  loop
    new_code := upper(substr(encode(extensions.gen_random_bytes(6), 'hex'), 1, 12));
    exit when not exists (select 1 from public.clubs where invite_code = new_code);
  end loop;
  update public.clubs set invite_code = new_code where id = target_club_id;
  return new_code;
end;
$$;

revoke all on function public.create_club(text, public.season_reset_mode, text, text) from public, anon;
revoke all on function public.update_club_settings(uuid, text, text, text, text, boolean, text, public.duration_preset, smallint, boolean) from public, anon;
revoke all on function public.regenerate_club_invite_code(uuid) from public, anon;
grant execute on function public.create_club(text, public.season_reset_mode, text, text) to authenticated;
grant execute on function public.update_club_settings(uuid, text, text, text, text, boolean, text, public.duration_preset, smallint, boolean) to authenticated;
grant execute on function public.regenerate_club_invite_code(uuid) to authenticated;
