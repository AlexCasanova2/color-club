create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  type text not null check (type in ('challenge', 'friend_request', 'weekly_summary')),
  title text not null,
  body text not null,
  related_club_id uuid references public.clubs(id) on delete cascade,
  related_challenge_id uuid references public.challenges(id) on delete cascade,
  related_user_id uuid references public.profiles(id) on delete cascade,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index notifications_user_created_idx on public.notifications(user_id, created_at desc);

alter table public.notifications enable row level security;

create policy "users read own notifications" on public.notifications
  for select to authenticated
  using (user_id = auth.uid());

create policy "users update own notifications" on public.notifications
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create or replace function public.notify_club_challenge_created(target_challenge_id uuid)
returns void
language plpgsql
security definer set search_path = ''
as $$
declare
  challenge_record record;
begin
  select c.id, c.club_id, c.created_by, cl.name as club_name
  into challenge_record
  from public.challenges c
  join public.clubs cl on cl.id = c.club_id
  where c.id = target_challenge_id;

  if challenge_record.id is null then return; end if;

  insert into public.notifications (user_id, type, title, body, related_club_id, related_challenge_id)
  select cm.user_id, 'challenge', 'Nuevo reto en ' || challenge_record.club_name, 'El reto ya está en marcha. Entra para ver tu color y la cuenta atrás.', challenge_record.club_id, challenge_record.id
  from public.club_members cm
  join public.profiles p on p.id = cm.user_id
  where cm.club_id = challenge_record.club_id
    and cm.status = 'active'
    and cm.user_id <> challenge_record.created_by
    and p.challenge_notifications;
end;
$$;

create or replace function public.create_weekly_summary_notifications()
returns integer
language plpgsql
security definer set search_path = ''
as $$
declare
  inserted_count integer;
begin
  insert into public.notifications (user_id, type, title, body)
  select p.id, 'weekly_summary', 'Tu resumen semanal', 'Tienes actividad nueva en Color Club. Revisa tus retos, votos y clubs.'
  from public.profiles p
  where p.weekly_summary
    and not exists (
      select 1 from public.notifications n
      where n.user_id = p.id
        and n.type = 'weekly_summary'
        and n.created_at > now() - interval '6 days'
    );
  get diagnostics inserted_count = row_count;
  return inserted_count;
end;
$$;

alter publication supabase_realtime add table public.notifications;

revoke execute on function public.create_weekly_summary_notifications() from public;
revoke execute on function public.create_weekly_summary_notifications() from authenticated;
