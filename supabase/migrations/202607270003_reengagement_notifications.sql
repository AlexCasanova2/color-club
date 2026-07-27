alter table public.profiles
  add column if not exists reengagement_notifications boolean not null default true;

grant update (reengagement_notifications) on public.profiles to authenticated;

create table public.user_activity (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  last_active_at timestamptz not null default now()
);

insert into public.user_activity (user_id)
select id from public.profiles
on conflict (user_id) do nothing;

alter table public.user_activity enable row level security;
revoke all on public.user_activity from anon, authenticated;

alter table public.notifications
  drop constraint if exists notifications_type_check;

alter table public.notifications
  add constraint notifications_type_check check (type in ('challenge', 'friend_request', 'club_invite', 'weekly_summary', 'reengagement'));

create or replace function public.touch_user_activity()
returns void
language plpgsql
security definer set search_path = ''
as $$
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;

  insert into public.user_activity (user_id, last_active_at)
  values (auth.uid(), now())
  on conflict (user_id) do update
  set last_active_at = excluded.last_active_at
  where public.user_activity.last_active_at < now() - interval '1 day';
end;
$$;

create or replace function public.create_reengagement_notifications()
returns integer
language plpgsql
security definer set search_path = ''
as $$
declare inserted_count integer := 0;
begin
  with eligible as (
    select
      p.id as user_id,
      ua.last_active_at,
      content.priority,
      content.club_id,
      content.challenge_id,
      content.club_name,
      fallback_club.id as fallback_club_id,
      fallback_club.name as fallback_club_name
    from public.profiles p
    join public.user_activity ua on ua.user_id = p.id
    left join lateral (
      select candidate.priority, candidate.club_id, candidate.challenge_id, candidate.club_name
      from (
        select 1 as priority, c.club_id, c.id as challenge_id, cl.name as club_name, c.created_at
        from public.challenges c
        join public.clubs cl on cl.id = c.club_id
        join public.challenge_participants cp on cp.challenge_id = c.id
        join public.club_members cm on cm.club_id = c.club_id and cm.user_id = cp.user_id
        where cp.user_id = p.id and cp.status = 'pending' and cm.status = 'active' and c.status = 'active' and c.ends_at > now()

        union all

        select 2 as priority, c.club_id, c.id as challenge_id, cl.name as club_name, c.created_at
        from public.challenges c
        join public.clubs cl on cl.id = c.club_id
        join public.challenge_participants cp on cp.challenge_id = c.id
        join public.club_members cm on cm.club_id = c.club_id and cm.user_id = cp.user_id
        where cp.user_id = p.id
          and cp.status = 'submitted'
          and cm.status = 'active'
          and c.status = 'voting'
          and c.voting_ends_at > now()
          and not exists (select 1 from public.votes v where v.challenge_id = c.id and v.voter_id = p.id)

        union all

        select 3 as priority, c.club_id, null::uuid as challenge_id, cl.name as club_name, c.created_at
        from public.challenges c
        join public.clubs cl on cl.id = c.club_id
        join public.club_members cm on cm.club_id = c.club_id
        where cm.user_id = p.id and cm.status = 'active' and c.created_at > ua.last_active_at
      ) candidate
      order by candidate.priority, candidate.created_at desc
      limit 1
    ) content on true
    left join lateral (
      select cl.id, cl.name
      from public.club_members cm
      join public.clubs cl on cl.id = cm.club_id
      where cm.user_id = p.id and cm.status = 'active'
      order by cm.joined_at desc
      limit 1
    ) fallback_club on true
    where p.reengagement_notifications
      and ua.last_active_at <= now() - interval '3 days'
      and exists (select 1 from public.push_tokens pt where pt.user_id = p.id)
      and not exists (
        select 1
        from public.notifications n
        where n.user_id = p.id and n.type = 'reengagement' and n.created_at > now() - interval '7 days'
      )
      and (
        (content.priority in (1, 2) and ua.last_active_at <= now() - interval '3 days')
        or (content.priority = 3 and ua.last_active_at <= now() - interval '7 days')
        or (fallback_club.id is not null and ua.last_active_at <= now() - interval '14 days')
      )
  )
  insert into public.notifications (user_id, type, title, body, related_club_id, related_challenge_id, dedupe_key)
  select
    user_id,
    'reengagement',
    case priority
      when 1 then 'Tu club sigue jugando'
      when 2 then 'Tu voto sigue pendiente'
      when 3 then 'Han pasado cosas en ' || club_name
      else 'Tu gente te espera en Color Club'
    end,
    case priority
      when 1 then 'Aún estás a tiempo de completar el reto de ' || club_name || '.'
      when 2 then 'Vuelve para elegir el mejor collage de ' || club_name || '.'
      when 3 then 'Tienes nuevos retos y resultados por descubrir.'
      else 'Vuelve a compartir color con ' || fallback_club_name || '.'
    end,
    coalesce(club_id, fallback_club_id),
    challenge_id,
    'reengagement:' || current_date::text
  from eligible
  on conflict (user_id, dedupe_key) where dedupe_key is not null do nothing;

  get diagnostics inserted_count = row_count;
  return inserted_count;
end;
$$;

revoke all on function public.touch_user_activity() from public, anon;
grant execute on function public.touch_user_activity() to authenticated;
revoke all on function public.create_reengagement_notifications() from public, anon, authenticated;
