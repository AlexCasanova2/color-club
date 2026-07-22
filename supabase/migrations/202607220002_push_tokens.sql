create table public.push_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  token text not null unique,
  platform text not null check (platform in ('ios', 'android', 'web')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index push_tokens_user_idx on public.push_tokens(user_id);

alter table public.push_tokens enable row level security;

create policy "users manage own push tokens" on public.push_tokens
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create or replace function public.save_push_token(target_token text, target_platform text)
returns void
language plpgsql
security definer set search_path = ''
as $$
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if target_platform not in ('ios', 'android', 'web') then raise exception 'Plataforma inválida'; end if;

  delete from public.push_tokens where token = target_token;

  insert into public.push_tokens (user_id, token, platform)
  values (auth.uid(), target_token, target_platform);
end;
$$;

grant execute on function public.save_push_token(text, text) to authenticated;
