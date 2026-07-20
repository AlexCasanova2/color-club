alter table public.club_members
  add column role text not null default 'member'
  check (role in ('member', 'admin'));

update public.club_members cm
set role = 'admin'
from public.clubs c
where c.id = cm.club_id and c.admin_id = cm.user_id;

create or replace function public.is_club_admin(target_club_id uuid, target_user_id uuid default auth.uid())
returns boolean
language sql
stable
security definer set search_path = ''
as $$
  select exists (
    select 1 from public.clubs c
    where c.id = target_club_id and c.admin_id = target_user_id
  ) or exists (
    select 1 from public.club_members cm
    where cm.club_id = target_club_id
      and cm.user_id = target_user_id
      and cm.status = 'active'
      and cm.role = 'admin'
  );
$$;

create or replace function public.create_club(
  club_name text,
  reset_mode public.season_reset_mode default 'manual'
)
returns uuid
language plpgsql
security definer set search_path = ''
as $$
declare new_club_id uuid;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  insert into public.clubs (name, admin_id, season_reset_mode)
  values (trim(club_name), auth.uid(), reset_mode)
  returning id into new_club_id;
  insert into public.club_members (club_id, user_id, role) values (new_club_id, auth.uid(), 'admin');
  insert into public.seasons (club_id) values (new_club_id);
  return new_club_id;
end;
$$;

create or replace function public.update_club_name(target_club_id uuid, new_name text)
returns void
language plpgsql
security definer set search_path = ''
as $$
begin
  if not public.is_club_admin(target_club_id) then raise exception 'Solo un admin puede editar el grupo'; end if;
  update public.clubs set name = trim(new_name) where id = target_club_id;
end;
$$;

create or replace function public.set_club_member_role(target_membership_id uuid, new_role text)
returns void
language plpgsql
security definer set search_path = ''
as $$
declare target_club_id uuid;
begin
  if new_role not in ('member', 'admin') then raise exception 'Rol inválido'; end if;
  select club_id into target_club_id from public.club_members where id = target_membership_id;
  if target_club_id is null then raise exception 'Miembro no encontrado'; end if;
  if not public.is_club_admin(target_club_id) then raise exception 'Solo un admin puede cambiar roles'; end if;
  update public.club_members set role = new_role where id = target_membership_id;
end;
$$;

create or replace function public.remove_club_member(target_membership_id uuid)
returns void
language plpgsql
security definer set search_path = ''
as $$
declare target_club_id uuid;
begin
  select club_id into target_club_id from public.club_members where id = target_membership_id;
  if target_club_id is null then raise exception 'Miembro no encontrado'; end if;
  if not public.is_club_admin(target_club_id) then raise exception 'Solo un admin puede eliminar miembros'; end if;
  update public.club_members set status = 'left' where id = target_membership_id;
end;
$$;

create or replace function public.delete_current_challenge(target_club_id uuid)
returns void
language plpgsql
security definer set search_path = ''
as $$
begin
  if not public.is_club_admin(target_club_id) then raise exception 'Solo un admin puede borrar retos'; end if;
  delete from public.challenges
  where id = (
    select id from public.challenges
    where club_id = target_club_id and status in ('configuring', 'active', 'voting')
    order by created_at desc
    limit 1
  );
end;
$$;

create or replace function public.delete_club(target_club_id uuid, confirmation text)
returns void
language plpgsql
security definer set search_path = ''
as $$
begin
  if confirmation <> 'BORRAR' then raise exception 'Confirmación inválida'; end if;
  if not public.is_club_admin(target_club_id) then raise exception 'Solo un admin puede borrar el grupo'; end if;
  delete from public.clubs where id = target_club_id;
end;
$$;

grant execute on function public.update_club_name(uuid, text) to authenticated;
grant execute on function public.set_club_member_role(uuid, text) to authenticated;
grant execute on function public.remove_club_member(uuid) to authenticated;
grant execute on function public.delete_current_challenge(uuid) to authenticated;
grant execute on function public.delete_club(uuid, text) to authenticated;
