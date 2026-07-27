create or replace function public.create_challenge_deadline_notifications()
returns integer
language plpgsql
security definer set search_path = ''
as $$
declare
  collage_reminder_count integer := 0;
  voting_reminder_count integer := 0;
begin
  insert into public.notifications (user_id, type, title, body, related_club_id, related_challenge_id, dedupe_key)
  select cp.user_id, 'challenge', 'Te quedan 2 horas', 'Aún puedes enviar tu collage antes de que termine el reto.', c.club_id, c.id, 'challenge-deadline-2h:' || c.id || ':' || cp.user_id
  from public.challenges c
  join public.challenge_participants cp on cp.challenge_id = c.id
  join public.profiles p on p.id = cp.user_id
  where c.status = 'active'
    and c.ends_at > now()
    and c.ends_at <= now() + interval '2 hours'
    and cp.status = 'pending'
    and p.challenge_notifications
  on conflict (user_id, dedupe_key) where dedupe_key is not null do nothing;

  get diagnostics collage_reminder_count = row_count;

  insert into public.notifications (user_id, type, title, body, related_club_id, related_challenge_id, dedupe_key)
  select
    cp.user_id,
    'challenge',
    'Última oportunidad para votar',
    'Quedan menos de 2 horas para elegir el mejor collage de ' || cl.name || '.',
    c.club_id,
    c.id,
    'challenge-voting-deadline-2h:' || c.id || ':' || cp.user_id
  from public.challenges c
  join public.clubs cl on cl.id = c.club_id
  join public.challenge_participants cp on cp.challenge_id = c.id
  join public.profiles p on p.id = cp.user_id
  where c.status = 'voting'
    and c.voting_ends_at > now()
    and c.voting_ends_at <= now() + interval '2 hours'
    and cp.status = 'submitted'
    and p.challenge_notifications
    and not exists (
      select 1
      from public.votes v
      where v.challenge_id = c.id and v.voter_id = cp.user_id
    )
  on conflict (user_id, dedupe_key) where dedupe_key is not null do nothing;

  get diagnostics voting_reminder_count = row_count;
  return collage_reminder_count + voting_reminder_count;
end;
$$;

revoke all on function public.create_challenge_deadline_notifications() from public, anon, authenticated;
