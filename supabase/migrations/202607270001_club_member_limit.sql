create or replace function public.enforce_club_member_limit()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
begin
  if new.status <> 'active' then
    return new;
  end if;

  if tg_op = 'UPDATE' then
    if old.status = 'active' and old.club_id = new.club_id then
      return new;
    end if;
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(new.club_id::text, 0));

  if tg_op = 'INSERT' and exists (
    select 1
    from public.club_members
    where club_id = new.club_id and user_id = new.user_id and status = 'active'
  ) then
    return new;
  end if;

  if (select count(*) from public.club_members where club_id = new.club_id and status = 'active') >= 12 then
    raise exception 'El club ya tiene el máximo de 12 integrantes';
  end if;

  return new;
end;
$$;

drop trigger if exists enforce_club_member_limit on public.club_members;
create trigger enforce_club_member_limit
before insert or update of status, club_id on public.club_members
for each row execute function public.enforce_club_member_limit();

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
  if (select count(*) from public.club_members where club_id = target_club_id and status = 'active') >= 12 then raise exception 'El club ya tiene el máximo de 12 integrantes'; end if;

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

revoke all on function public.enforce_club_member_limit() from public, anon, authenticated;
revoke all on function public.invite_user_to_club(uuid, text) from public, anon;
grant execute on function public.invite_user_to_club(uuid, text) to authenticated;
