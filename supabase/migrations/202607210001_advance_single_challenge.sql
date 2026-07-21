create or replace function public.advance_challenge(target_challenge_id uuid)
returns void
language plpgsql
security definer set search_path = ''
as $$
declare target_club_id uuid;
begin
  select club_id into target_club_id from public.challenges where id = target_challenge_id;
  if target_club_id is null then raise exception 'Reto no encontrado'; end if;
  if not public.is_active_club_member(target_club_id) then raise exception 'No tienes acceso a este reto'; end if;

  update public.challenges
  set status = 'active'
  where id = target_challenge_id and status = 'configuring' and starts_at <= now();

  update public.challenge_participants cp
  set status = 'disqualified'
  where cp.status = 'pending'
    and exists (
      select 1 from public.challenges c
      where c.id = target_challenge_id
        and c.id = cp.challenge_id
        and c.status = 'active'
        and c.ends_at <= now()
    );

  update public.challenges
  set status = 'voting', voting_ends_at = now() + interval '24 hours'
  where id = target_challenge_id and status = 'active' and ends_at <= now();

  update public.challenges
  set status = 'closed'
  where id = target_challenge_id and status = 'voting' and voting_ends_at <= now();
end;
$$;

grant execute on function public.advance_challenge(uuid) to authenticated;
