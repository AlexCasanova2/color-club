create table if not exists public.club_invites (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubs(id) on delete cascade,
  inviter_id uuid not null references public.profiles(id) on delete cascade,
  invitee_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'declined', 'cancelled')),
  created_at timestamptz not null default now(),
  responded_at timestamptz
);

create unique index if not exists one_pending_club_invite_per_user
  on public.club_invites(club_id, invitee_id)
  where status = 'pending';

alter table public.club_invites enable row level security;

drop policy if exists "users read related club invites" on public.club_invites;
create policy "users read related club invites" on public.club_invites
  for select to authenticated
  using (inviter_id = auth.uid() or invitee_id = auth.uid() or public.is_club_admin(club_id));

revoke insert, update, delete on public.club_invites from anon, authenticated;
grant select on public.club_invites to authenticated;

alter table public.notifications
  drop constraint if exists notifications_type_check;

alter table public.notifications
  add constraint notifications_type_check check (type in ('challenge', 'friend_request', 'club_invite', 'weekly_summary'));

alter table public.notifications
  add column if not exists related_invite_id uuid references public.club_invites(id) on delete cascade;

create or replace function public.invite_user_to_club(target_club_id uuid, search_term text)
returns uuid
language plpgsql
security definer set search_path = ''
as $$
declare
  target_user_id uuid;
  target_invite_id uuid;
  inviter_name text;
  club_name text;
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
  if target_user_id = auth.uid() then raise exception 'No puedes invitarte a tu propio club'; end if;
  if public.is_active_club_member(target_club_id, target_user_id) then raise exception 'Esta persona ya forma parte del club'; end if;

  select id into target_invite_id
  from public.club_invites
  where club_id = target_club_id and invitee_id = target_user_id and status = 'pending';

  if target_invite_id is not null then return target_invite_id; end if;

  insert into public.club_invites (club_id, inviter_id, invitee_id)
  values (target_club_id, auth.uid(), target_user_id)
  returning id into target_invite_id;

  select display_name into inviter_name from public.profiles where id = auth.uid();
  select name into club_name from public.clubs where id = target_club_id;

  insert into public.notifications (user_id, type, title, body, related_club_id, related_user_id, related_invite_id)
  select target_user_id, 'club_invite', 'Invitación a ' || club_name, coalesce(inviter_name, 'Alguien') || ' quiere que te unas a este club.', target_club_id, auth.uid(), target_invite_id
  from public.profiles p
  where p.id = target_user_id and p.friend_notifications;

  return target_invite_id;
end;
$$;

create or replace function public.respond_club_invite(target_invite_id uuid, accept_invite boolean)
returns uuid
language plpgsql
security definer set search_path = ''
as $$
declare
  invite_record public.club_invites%rowtype;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;

  select * into invite_record
  from public.club_invites
  where id = target_invite_id and invitee_id = auth.uid() and status = 'pending';

  if invite_record.id is null then raise exception 'Invitación no disponible'; end if;

  if accept_invite then
    if not exists (select 1 from public.clubs where id = invite_record.club_id and invites_enabled) then raise exception 'Las invitaciones están pausadas'; end if;

    insert into public.club_members (club_id, user_id, status)
    values (invite_record.club_id, auth.uid(), 'active')
    on conflict (club_id, user_id) do update set status = 'active';

    update public.club_invites
    set status = 'accepted', responded_at = now()
    where id = target_invite_id;

    update public.club_invites
    set status = 'declined', responded_at = now()
    where club_id = invite_record.club_id and invitee_id = auth.uid() and status = 'pending' and id <> target_invite_id;
  else
    update public.club_invites
    set status = 'declined', responded_at = now()
    where id = target_invite_id;
  end if;

  update public.notifications
  set read_at = coalesce(read_at, now())
  where related_invite_id = target_invite_id and user_id = auth.uid();

  return invite_record.club_id;
end;
$$;

revoke all on function public.invite_user_to_club(uuid, text) from public, anon;
grant execute on function public.invite_user_to_club(uuid, text) to authenticated;
revoke all on function public.respond_club_invite(uuid, boolean) from public, anon;
grant execute on function public.respond_club_invite(uuid, boolean) to authenticated;
