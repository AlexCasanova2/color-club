create extension if not exists pgcrypto;

create type public.season_reset_mode as enum ('manual', 'monthly_auto');
create type public.member_status as enum ('active', 'left');
create type public.challenge_mode as enum ('individual_random', 'shared_color');
create type public.duration_preset as enum ('24h', '48h', '1week');
create type public.challenge_status as enum ('configuring', 'active', 'voting', 'closed');
create type public.participant_status as enum ('pending', 'submitted', 'disqualified');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null check (char_length(display_name) between 2 and 40),
  avatar_url text,
  created_at timestamptz not null default now()
);

create table public.clubs (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 2 and 50),
  photo_url text,
  admin_id uuid not null references public.profiles(id),
  invite_code text not null unique default upper(substr(encode(gen_random_bytes(6), 'hex'), 1, 8)),
  season_reset_mode public.season_reset_mode not null default 'manual',
  created_at timestamptz not null default now()
);

create table public.club_members (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubs(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  status public.member_status not null default 'active',
  joined_at timestamptz not null default now(),
  unique (club_id, user_id)
);

create table public.seasons (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubs(id) on delete cascade,
  starts_at timestamptz not null default now(),
  ends_at timestamptz,
  is_active boolean not null default true
);

create unique index one_active_season_per_club on public.seasons(club_id) where is_active;

create table public.challenges (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubs(id) on delete cascade,
  season_id uuid not null references public.seasons(id),
  mode public.challenge_mode not null,
  shared_color text,
  duration_preset public.duration_preset not null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  voting_ends_at timestamptz,
  status public.challenge_status not null default 'configuring',
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  constraint shared_color_matches_mode check (
    (mode = 'shared_color' and shared_color is not null) or
    (mode = 'individual_random' and shared_color is null)
  ),
  constraint valid_challenge_dates check (ends_at > starts_at)
);

create table public.challenge_participants (
  id uuid primary key default gen_random_uuid(),
  challenge_id uuid not null references public.challenges(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  assigned_color text,
  status public.participant_status not null default 'pending',
  submitted_at timestamptz,
  unique (challenge_id, user_id)
);

create table public.photos (
  id uuid primary key default gen_random_uuid(),
  participant_id uuid not null references public.challenge_participants(id) on delete cascade,
  photo_url text not null,
  slot_order smallint not null check (slot_order between 1 and 6),
  created_at timestamptz not null default now(),
  unique (participant_id, slot_order)
);

create table public.votes (
  id uuid primary key default gen_random_uuid(),
  challenge_id uuid not null references public.challenges(id) on delete cascade,
  voter_id uuid not null references public.profiles(id) on delete cascade,
  voted_participant_id uuid not null references public.challenge_participants(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (challenge_id, voter_id)
);

create index club_members_user_idx on public.club_members(user_id, status);
create index challenges_club_idx on public.challenges(club_id, status);
create index participants_challenge_idx on public.challenge_participants(challenge_id, status);
create index photos_participant_idx on public.photos(participant_id);
create index votes_target_idx on public.votes(voted_participant_id);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    coalesce(nullif(new.raw_user_meta_data ->> 'display_name', ''), split_part(coalesce(new.email, 'colorista'), '@', 1))
  );
  return new;
end;
$$;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

create or replace function public.is_active_club_member(target_club_id uuid, target_user_id uuid default auth.uid())
returns boolean
language sql
stable
security definer set search_path = ''
as $$
  select exists (
    select 1 from public.club_members
    where club_id = target_club_id and user_id = target_user_id and status = 'active'
  );
$$;

create or replace function public.is_club_admin(target_club_id uuid, target_user_id uuid default auth.uid())
returns boolean
language sql
stable
security definer set search_path = ''
as $$
  select exists (
    select 1 from public.clubs where id = target_club_id and admin_id = target_user_id
  );
$$;

create or replace function public.owns_participant(target_participant_id uuid)
returns boolean
language sql
stable
security definer set search_path = ''
as $$
  select exists (
    select 1 from public.challenge_participants
    where id = target_participant_id and user_id = auth.uid()
  );
$$;

create or replace function public.can_edit_participant(target_participant_id uuid)
returns boolean
language sql
stable
security definer set search_path = ''
as $$
  select exists (
    select 1 from public.challenge_participants cp
    join public.challenges c on c.id = cp.challenge_id
    where cp.id = target_participant_id and cp.user_id = auth.uid()
      and cp.status = 'pending' and c.status = 'active' and c.ends_at > now()
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
  insert into public.club_members (club_id, user_id) values (new_club_id, auth.uid());
  insert into public.seasons (club_id) values (new_club_id);
  return new_club_id;
end;
$$;

create or replace function public.join_club(code text)
returns uuid
language plpgsql
security definer set search_path = ''
as $$
declare target_club_id uuid;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  select id into target_club_id from public.clubs where invite_code = upper(trim(code));
  if target_club_id is null then raise exception 'Código de invitación inválido'; end if;
  insert into public.club_members (club_id, user_id, status)
  values (target_club_id, auth.uid(), 'active')
  on conflict (club_id, user_id) do update set status = 'active';
  return target_club_id;
end;
$$;

create or replace function public.create_shared_challenge(
  target_club_id uuid,
  color text,
  preset public.duration_preset,
  begins_at timestamptz default now()
)
returns uuid
language plpgsql
security definer set search_path = ''
as $$
declare
  active_season_id uuid;
  new_challenge_id uuid;
  finish_at timestamptz;
begin
  if not public.is_club_admin(target_club_id) then raise exception 'Solo el admin puede crear retos'; end if;
  if exists (select 1 from public.challenges where club_id = target_club_id and status in ('active', 'voting')) then
    raise exception 'Ya hay un reto en curso';
  end if;
  select id into active_season_id from public.seasons where club_id = target_club_id and is_active;
  finish_at := begins_at + case preset when '24h' then interval '24 hours' when '48h' then interval '48 hours' else interval '7 days' end;
  insert into public.challenges (
    club_id, season_id, mode, shared_color, duration_preset, starts_at, ends_at, status, created_by
  ) values (
    target_club_id, active_season_id, 'shared_color', color, preset, begins_at, finish_at,
    case when begins_at <= now() then 'active'::public.challenge_status else 'configuring'::public.challenge_status end,
    auth.uid()
  ) returning id into new_challenge_id;
  insert into public.challenge_participants (challenge_id, user_id)
  select new_challenge_id, user_id from public.club_members
  where club_id = target_club_id and status = 'active';
  return new_challenge_id;
end;
$$;

create or replace function public.submit_collage(target_participant_id uuid)
returns void
language plpgsql
security definer set search_path = ''
as $$
declare target_challenge_id uuid;
begin
  select cp.challenge_id into target_challenge_id
  from public.challenge_participants cp
  join public.challenges c on c.id = cp.challenge_id
  where cp.id = target_participant_id and cp.user_id = auth.uid()
    and cp.status = 'pending' and c.status = 'active' and c.ends_at > now();
  if target_challenge_id is null then raise exception 'El collage ya no se puede enviar'; end if;
  if (select count(*) from public.photos where participant_id = target_participant_id) <> 6 then
    raise exception 'El collage debe tener exactamente 6 fotos';
  end if;
  update public.challenge_participants set status = 'submitted', submitted_at = now()
  where id = target_participant_id;
  if not exists (
    select 1 from public.challenge_participants where challenge_id = target_challenge_id and status = 'pending'
  ) then
    update public.challenges
    set status = 'voting', voting_ends_at = now() + interval '24 hours'
    where id = target_challenge_id and status = 'active';
  end if;
end;
$$;

create or replace function public.validate_vote()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
declare target_owner uuid;
begin
  if new.voter_id <> auth.uid() then raise exception 'Votante inválido'; end if;
  select user_id into target_owner from public.challenge_participants
  where id = new.voted_participant_id and challenge_id = new.challenge_id and status = 'submitted';
  if target_owner is null then raise exception 'Participante no votable'; end if;
  if target_owner = new.voter_id then raise exception 'No puedes votarte a ti mismo'; end if;
  if not exists (
    select 1 from public.challenges c
    join public.challenge_participants cp on cp.challenge_id = c.id
    where c.id = new.challenge_id and c.status = 'voting'
      and cp.user_id = new.voter_id and cp.status = 'submitted'
  ) then raise exception 'No puedes votar en este reto'; end if;
  return new;
end;
$$;

create trigger votes_are_valid before insert or update on public.votes
for each row execute function public.validate_vote();

create or replace function public.advance_challenges()
returns void
language plpgsql
security definer set search_path = ''
as $$
begin
  update public.challenges set status = 'active'
  where status = 'configuring' and starts_at <= now();
  update public.challenge_participants cp set status = 'disqualified'
  where cp.status = 'pending' and exists (
    select 1 from public.challenges c where c.id = cp.challenge_id and c.status = 'active' and c.ends_at <= now()
  );
  update public.challenges set status = 'voting', voting_ends_at = now() + interval '24 hours'
  where status = 'active' and ends_at <= now();
  update public.challenges set status = 'closed'
  where status = 'voting' and voting_ends_at <= now();
end;
$$;

create or replace function public.reset_monthly_seasons()
returns void
language plpgsql
security definer set search_path = ''
as $$
declare season_row record;
begin
  for season_row in
    select s.id, s.club_id from public.seasons s join public.clubs c on c.id = s.club_id
    where s.is_active and c.season_reset_mode = 'monthly_auto'
      and date_trunc('month', s.starts_at) < date_trunc('month', now())
  loop
    update public.seasons set is_active = false, ends_at = now() where id = season_row.id;
    insert into public.seasons (club_id) values (season_row.club_id);
  end loop;
end;
$$;

create view public.season_ranking
with (security_invoker = true)
as
with scores as (
  select c.season_id, cp.user_id, p.display_name, p.avatar_url, count(v.id)::integer as points
  from public.challenge_participants cp
  join public.challenges c on c.id = cp.challenge_id
  join public.profiles p on p.id = cp.user_id
  left join public.votes v on v.voted_participant_id = cp.id
  where c.status = 'closed' and cp.status = 'submitted'
  group by c.season_id, cp.user_id, p.display_name, p.avatar_url
)
select season_id, user_id, display_name, avatar_url, points,
  rank() over (partition by season_id order by points desc)::integer as position
from scores;

alter table public.profiles enable row level security;
alter table public.clubs enable row level security;
alter table public.club_members enable row level security;
alter table public.seasons enable row level security;
alter table public.challenges enable row level security;
alter table public.challenge_participants enable row level security;
alter table public.photos enable row level security;
alter table public.votes enable row level security;

create policy "members read profiles" on public.profiles for select to authenticated using (
  id = auth.uid() or exists (
    select 1 from public.club_members mine join public.club_members theirs on theirs.club_id = mine.club_id
    where mine.user_id = auth.uid() and mine.status = 'active' and theirs.user_id = profiles.id and theirs.status = 'active'
  )
);
create policy "users update own profile" on public.profiles for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

create policy "members read clubs" on public.clubs for select to authenticated using (public.is_active_club_member(id));
create policy "admins update clubs" on public.clubs for update to authenticated using (admin_id = auth.uid()) with check (admin_id = auth.uid());

create policy "members read memberships" on public.club_members for select to authenticated using (public.is_active_club_member(club_id));
create policy "users leave clubs" on public.club_members for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "members read seasons" on public.seasons for select to authenticated using (public.is_active_club_member(club_id));
create policy "members read challenges" on public.challenges for select to authenticated using (public.is_active_club_member(club_id));
create policy "members read participants" on public.challenge_participants for select to authenticated using (
  exists (select 1 from public.challenges c where c.id = challenge_id and public.is_active_club_member(c.club_id))
);

create policy "owners read photos before voting" on public.photos for select to authenticated using (
  public.owns_participant(participant_id) or exists (
    select 1 from public.challenge_participants cp join public.challenges c on c.id = cp.challenge_id
    where cp.id = participant_id and c.status in ('voting', 'closed') and public.is_active_club_member(c.club_id)
  )
);
create policy "owners add draft photos" on public.photos for insert to authenticated with check (
  public.can_edit_participant(participant_id)
);
create policy "owners update draft photos" on public.photos for update to authenticated using (
  public.can_edit_participant(participant_id)
) with check (public.can_edit_participant(participant_id));
create policy "owners delete draft photos" on public.photos for delete to authenticated using (
  public.can_edit_participant(participant_id)
);

create policy "members read votes" on public.votes for select to authenticated using (
  exists (select 1 from public.challenges c where c.id = challenge_id and public.is_active_club_member(c.club_id))
);
create policy "participants cast vote" on public.votes for insert to authenticated with check (voter_id = auth.uid());

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('collages', 'collages', false, 10485760, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

create policy "owners upload collage objects" on storage.objects for insert to authenticated with check (
  bucket_id = 'collages' and public.can_edit_participant(((storage.foldername(name))[1])::uuid)
);
create policy "owners replace collage objects" on storage.objects for update to authenticated using (
  bucket_id = 'collages' and public.can_edit_participant(((storage.foldername(name))[1])::uuid)
);
create policy "owners delete collage objects" on storage.objects for delete to authenticated using (
  bucket_id = 'collages' and public.can_edit_participant(((storage.foldername(name))[1])::uuid)
);
create policy "members download visible collage objects" on storage.objects for select to authenticated using (
  bucket_id = 'collages' and exists (
    select 1 from public.photos p where p.photo_url = name
  )
);

revoke all on function public.advance_challenges() from public, anon, authenticated;
revoke all on function public.reset_monthly_seasons() from public, anon, authenticated;
grant execute on function public.create_club(text, public.season_reset_mode) to authenticated;
grant execute on function public.join_club(text) to authenticated;
grant execute on function public.create_shared_challenge(uuid, text, public.duration_preset, timestamptz) to authenticated;
grant execute on function public.submit_collage(uuid) to authenticated;

alter publication supabase_realtime add table public.challenge_participants;
alter publication supabase_realtime add table public.challenges;

-- Supabase Cron setup (run once after enabling pg_cron):
-- select cron.schedule('advance-challenges', '* * * * *', 'select public.advance_challenges()');
-- select cron.schedule('reset-monthly-seasons', '5 0 * * *', 'select public.reset_monthly_seasons()');
