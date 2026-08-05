create table public.user_blocks (
  blocker_id uuid not null references public.profiles(id) on delete cascade,
  blocked_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  check (blocker_id <> blocked_id)
);

create index user_blocks_blocked_idx on public.user_blocks(blocked_id, blocker_id);

create table public.user_reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid references auth.users(id) on delete set null,
  reported_user_id uuid references auth.users(id) on delete set null,
  subject_type text not null check (subject_type in ('profile', 'club_message', 'collage')),
  subject_id uuid,
  reason text not null check (reason in ('harassment', 'hate', 'sexual_content', 'violence', 'privacy', 'spam', 'other')),
  details text check (details is null or char_length(trim(details)) between 1 and 500),
  content_snapshot jsonb not null default '{}'::jsonb,
  status text not null default 'open' check (status in ('open', 'reviewing', 'actioned', 'dismissed')),
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  check ((subject_type = 'profile' and subject_id is null) or (subject_type <> 'profile' and subject_id is not null))
);

create index user_reports_queue_idx on public.user_reports(status, created_at);
create index user_reports_reported_user_idx on public.user_reports(reported_user_id, created_at desc);
create unique index user_reports_open_subject_idx
  on public.user_reports (reporter_id, reported_user_id, subject_type, coalesce(subject_id, reported_user_id))
  where status in ('open', 'reviewing');

create table public.content_moderation_terms (
  term text primary key check (char_length(trim(term)) between 2 and 80),
  created_at timestamptz not null default now()
);

insert into public.content_moderation_terms (term) values
  ('gilipollas'), ('imbécil'), ('idiota'), ('puta'), ('puto')
on conflict do nothing;

alter table public.user_blocks enable row level security;
alter table public.user_reports enable row level security;
alter table public.content_moderation_terms enable row level security;

create policy "users read own block list" on public.user_blocks
  for select to authenticated using (blocker_id = auth.uid());

create policy "moderators read reports" on public.user_reports
  for select to authenticated using (public.has_platform_admin_role('moderator'));

create policy "moderators update reports" on public.user_reports
  for update to authenticated using (public.has_platform_admin_role('moderator'))
  with check (public.has_platform_admin_role('moderator') and reviewed_by = auth.uid() and reviewed_at is not null);

revoke insert, update, delete on public.user_blocks from anon, authenticated;
grant select on public.user_blocks to authenticated;
revoke all on public.user_reports from anon, authenticated;
grant select on public.user_reports to authenticated;
grant update (status, reviewed_at, reviewed_by) on public.user_reports to authenticated;
revoke all on public.content_moderation_terms from anon, authenticated;

create or replace function public.is_blocked_with_current_user(target_user_id uuid)
returns boolean
language sql
stable
security definer set search_path = ''
as $$
  select auth.uid() is not null and exists (
    select 1 from public.user_blocks b
    where (b.blocker_id = auth.uid() and b.blocked_id = target_user_id)
       or (b.blocker_id = target_user_id and b.blocked_id = auth.uid())
  );
$$;

create or replace function public.block_user(target_user_id uuid)
returns void
language plpgsql
security definer set search_path = ''
as $$
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if target_user_id = auth.uid() then raise exception 'No puedes bloquearte a ti mismo'; end if;
  if not exists (select 1 from public.profiles where id = target_user_id) then raise exception 'Usuario no disponible'; end if;

  insert into public.user_blocks (blocker_id, blocked_id)
  values (auth.uid(), target_user_id)
  on conflict do nothing;

  delete from public.friendships
  where (requester_id = auth.uid() and addressee_id = target_user_id)
     or (requester_id = target_user_id and addressee_id = auth.uid());

  update public.club_invites set status = 'declined', responded_at = now()
  where status = 'pending'
    and ((inviter_id = auth.uid() and invitee_id = target_user_id)
      or (inviter_id = target_user_id and invitee_id = auth.uid()));

  delete from public.notifications
  where (user_id = auth.uid() and related_user_id = target_user_id)
     or (user_id = target_user_id and related_user_id = auth.uid());
end;
$$;

create or replace function public.unblock_user(target_user_id uuid)
returns void
language sql
security definer set search_path = ''
as $$
  delete from public.user_blocks where blocker_id = auth.uid() and blocked_id = target_user_id;
$$;

create or replace function public.submit_user_report(
  target_user_id uuid,
  target_subject_type text,
  target_subject_id uuid,
  target_reason text,
  target_details text default null
)
returns uuid
language plpgsql
security definer set search_path = ''
as $$
declare
  report_id uuid;
  snapshot jsonb;
  subject_club_id uuid;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if target_user_id = auth.uid() then raise exception 'No puedes denunciar tu propio contenido'; end if;
  if target_reason not in ('harassment', 'hate', 'sexual_content', 'violence', 'privacy', 'spam', 'other') then raise exception 'Motivo no válido'; end if;
  if target_details is not null and (char_length(trim(target_details)) < 1 or char_length(trim(target_details)) > 500) then raise exception 'El detalle debe tener entre 1 y 500 caracteres'; end if;

  if target_subject_type = 'profile' and target_subject_id is null then
    if not public.can_view_public_profile(target_user_id) then raise exception 'Perfil no disponible'; end if;
    select jsonb_build_object('display_name', display_name, 'username', username, 'bio', bio, 'status_text', status_text, 'avatar_url', avatar_url)
      into snapshot from public.profiles where id = target_user_id;
  elsif target_subject_type = 'club_message' and target_subject_id is not null then
    select m.club_id, jsonb_build_object('body', m.body, 'club_id', m.club_id, 'created_at', m.created_at)
      into subject_club_id, snapshot
      from public.club_messages m
      where m.id = target_subject_id and m.sender_id = target_user_id;
    if snapshot is null or not public.is_active_club_member(subject_club_id) then raise exception 'Mensaje no disponible'; end if;
  elsif target_subject_type = 'collage' and target_subject_id is not null then
    select c.club_id, jsonb_build_object(
      'participant_id', cp.id,
      'challenge_id', cp.challenge_id,
      'photos', coalesce((select jsonb_agg(p.photo_url order by p.slot_order) from public.photos p where p.participant_id = cp.id), '[]'::jsonb)
    ) into subject_club_id, snapshot
    from public.challenge_participants cp
    join public.challenges c on c.id = cp.challenge_id
    where cp.id = target_subject_id and cp.user_id = target_user_id and c.status in ('voting', 'closed');
    if snapshot is null or not public.is_active_club_member(subject_club_id) then raise exception 'Collage no disponible'; end if;
  else
    raise exception 'Contenido no válido';
  end if;

  if snapshot is null then raise exception 'Contenido no disponible'; end if;

  select id into report_id
  from public.user_reports
  where reporter_id = auth.uid()
    and reported_user_id = target_user_id
    and subject_type = target_subject_type
    and coalesce(subject_id, reported_user_id) = coalesce(target_subject_id, target_user_id)
    and status in ('open', 'reviewing')
  limit 1;
  if report_id is not null then return report_id; end if;

  insert into public.user_reports (reporter_id, reported_user_id, subject_type, subject_id, reason, details, content_snapshot)
  values (auth.uid(), target_user_id, target_subject_type, target_subject_id, target_reason, nullif(trim(target_details), ''), snapshot)
  returning id into report_id;
  return report_id;
end;
$$;

revoke all on function public.is_blocked_with_current_user(uuid) from public, anon;
revoke all on function public.block_user(uuid) from public, anon;
revoke all on function public.unblock_user(uuid) from public, anon;
revoke all on function public.submit_user_report(uuid, text, uuid, text, text) from public, anon;
grant execute on function public.is_blocked_with_current_user(uuid) to authenticated;
grant execute on function public.block_user(uuid) to authenticated;
grant execute on function public.unblock_user(uuid) to authenticated;
grant execute on function public.submit_user_report(uuid, text, uuid, text, text) to authenticated;

create or replace function public.reject_disallowed_content()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
declare content text;
begin
  if tg_table_name = 'profiles' then
    content := concat_ws(' ', new.display_name, new.username, new.bio, new.status_text);
  elsif tg_table_name = 'clubs' then
    content := concat_ws(' ', new.name, new.description);
  else
    content := new.body;
  end if;
  if exists (
    select 1 from public.content_moderation_terms t
    where lower(content) ~ ('(^|[^[:alnum:]_])' || lower(t.term) || '([^[:alnum:]_]|$)')
  ) then
    raise exception 'El contenido incluye lenguaje no permitido';
  end if;
  return new;
end;
$$;

create trigger moderate_profile_content before insert or update of display_name, username, bio, status_text on public.profiles
  for each row execute function public.reject_disallowed_content();
create trigger moderate_club_content before insert or update of name, description on public.clubs
  for each row execute function public.reject_disallowed_content();
create trigger moderate_chat_content before insert or update of body on public.club_messages
  for each row execute function public.reject_disallowed_content();

revoke all on function public.reject_disallowed_content() from public, anon, authenticated;

create or replace function public.prevent_blocked_relationships()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
declare first_user uuid; second_user uuid;
begin
  if tg_table_name = 'friendships' then
    first_user := new.requester_id; second_user := new.addressee_id;
  else
    if new.status = 'declined' then return new; end if;
    first_user := new.inviter_id; second_user := new.invitee_id;
  end if;
  if exists (
    select 1 from public.user_blocks b
    where (b.blocker_id = first_user and b.blocked_id = second_user)
       or (b.blocker_id = second_user and b.blocked_id = first_user)
  ) then
    raise exception 'No puedes contactar con este usuario';
  end if;
  return new;
end;
$$;

create trigger prevent_blocked_friendships before insert or update on public.friendships
  for each row execute function public.prevent_blocked_relationships();
create trigger prevent_blocked_club_invites before insert or update on public.club_invites
  for each row execute function public.prevent_blocked_relationships();

revoke all on function public.prevent_blocked_relationships() from public, anon, authenticated;

create policy "blocked users cannot read each other profiles" on public.profiles
  as restrictive for select to authenticated
  using (id = auth.uid() or not public.is_blocked_with_current_user(id));

create policy "blocked users do not exchange chat messages" on public.club_messages
  as restrictive for select to authenticated
  using (sender_id = auth.uid() or not public.is_blocked_with_current_user(sender_id));

create or replace function public.participant_owner(target_participant_id uuid)
returns uuid
language sql
stable
security definer set search_path = ''
as $$ select user_id from public.challenge_participants where id = target_participant_id; $$;

create or replace function public.collage_object_owner(object_name text)
returns uuid
language sql
stable
security definer set search_path = ''
as $$
  select cp.user_id
  from public.challenge_participants cp
  where cp.id = nullif((storage.foldername(object_name))[1], '')::uuid;
$$;

create or replace function public.can_moderate_collage_object(object_name text)
returns boolean
language sql
stable
security definer set search_path = ''
as $$
  select public.has_platform_admin_role('moderator') and exists (
    select 1 from public.user_reports r
    where r.subject_type = 'collage'
      and r.status in ('open', 'reviewing')
      and (r.content_snapshot -> 'photos') ? object_name
  );
$$;

revoke all on function public.participant_owner(uuid) from public, anon;
revoke all on function public.collage_object_owner(text) from public, anon;
revoke all on function public.can_moderate_collage_object(text) from public, anon;
grant execute on function public.participant_owner(uuid) to authenticated;
grant execute on function public.collage_object_owner(text) to authenticated;
grant execute on function public.can_moderate_collage_object(text) to authenticated;

create policy "blocked users cannot read each other photos" on public.photos
  as restrictive for select to authenticated
  using (
    public.participant_owner(participant_id) = auth.uid()
    or not public.is_blocked_with_current_user(public.participant_owner(participant_id))
  );

create policy "blocked users cannot download each other collages" on storage.objects
  as restrictive for select to authenticated
  using (
    bucket_id <> 'collages'
    or public.collage_object_owner(name) = auth.uid()
    or not public.is_blocked_with_current_user(public.collage_object_owner(name))
    or public.can_moderate_collage_object(name)
  );

create policy "moderators download reported collages" on storage.objects
  for select to authenticated
  using (bucket_id = 'collages' and public.can_moderate_collage_object(name));

create policy "blocked users do not receive related notifications" on public.notifications
  as restrictive for select to authenticated
  using (related_user_id is null or not public.is_blocked_with_current_user(related_user_id));

create or replace function public.can_view_public_profile(target_user_id uuid, viewer_user_id uuid default auth.uid())
returns boolean
language sql
stable
security definer set search_path = ''
as $$
  select viewer_user_id is not null
    and not exists (
      select 1 from public.user_blocks b
      where (b.blocker_id = viewer_user_id and b.blocked_id = target_user_id)
         or (b.blocker_id = target_user_id and b.blocked_id = viewer_user_id)
    )
    and (
      target_user_id = viewer_user_id
      or exists (
        select 1 from public.club_members mine
        join public.club_members theirs on theirs.club_id = mine.club_id
        where mine.user_id = viewer_user_id and mine.status = 'active'
          and theirs.user_id = target_user_id and theirs.status = 'active'
      )
      or exists (
        select 1 from public.friendships f
        where f.status = 'accepted'
          and ((f.requester_id = viewer_user_id and f.addressee_id = target_user_id)
            or (f.addressee_id = viewer_user_id and f.requester_id = target_user_id))
      )
    );
$$;

create or replace function public.search_public_profiles(search_term text, limit_count integer default 6)
returns table (id uuid, display_name text, username text, avatar_url text, avatar_color text)
language sql
stable
security definer set search_path = ''
as $$
  select p.id, p.display_name, p.username, p.avatar_url, p.avatar_color
  from public.profiles p
  where auth.uid() is not null and p.id <> auth.uid()
    and not public.is_blocked_with_current_user(p.id)
    and p.profile_discoverable and p.allow_friend_requests
    and char_length(trim(search_term)) >= 2
    and (lower(p.username) like lower(ltrim(trim(search_term), '@')) || '%'
      or p.display_name ilike '%' || trim(search_term) || '%'
      or p.friend_code = upper(trim(search_term)))
  order by case when lower(p.username) = lower(ltrim(trim(search_term), '@')) then 0 else 1 end, p.display_name
  limit least(greatest(limit_count, 1), 10);
$$;

create or replace function public.send_friend_request(search_term text)
returns uuid
language plpgsql
security definer set search_path = ''
as $$
declare target_user_id uuid; existing public.friendships%rowtype; friendship_id uuid;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  select p.id into target_user_id from public.profiles p
  where p.profile_discoverable and p.allow_friend_requests
    and (lower(p.username) = lower(ltrim(trim(search_term), '@')) or p.friend_code = upper(trim(search_term)));
  if target_user_id is null or public.is_blocked_with_current_user(target_user_id) then raise exception 'No existe un usuario disponible con ese identificador'; end if;
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
    update public.friendships set requester_id = auth.uid(), addressee_id = target_user_id, status = 'pending', created_at = now(), responded_at = null where id = existing.id;
    friendship_id := existing.id;
  else
    insert into public.friendships (requester_id, addressee_id) values (auth.uid(), target_user_id) returning id into friendship_id;
  end if;
  insert into public.notifications (user_id, type, title, body, related_user_id)
  select target_user_id, 'friend_request', 'Nueva solicitud de amistad', p.display_name || ' quiere añadirte en Color Club.', auth.uid()
  from public.profiles p join public.profiles target_profile on target_profile.id = target_user_id
  where p.id = auth.uid() and target_profile.friend_notifications;
  return friendship_id;
end;
$$;

create or replace function public.delete_push_token(target_token text)
returns void
language sql
security definer set search_path = ''
as $$ delete from public.push_tokens where user_id = auth.uid() and token = trim(target_token); $$;

revoke all on function public.delete_push_token(text) from public, anon;
grant execute on function public.delete_push_token(text) to authenticated;
