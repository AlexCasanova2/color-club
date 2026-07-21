create table public.club_messages (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubs(id) on delete cascade,
  sender_id uuid not null references public.profiles(id) on delete cascade,
  body text not null check (char_length(trim(body)) between 1 and 500),
  created_at timestamptz not null default now()
);

create index club_messages_club_created_idx on public.club_messages(club_id, created_at desc);

alter table public.club_messages enable row level security;

create policy "members read club messages" on public.club_messages
  for select to authenticated
  using (public.is_active_club_member(club_id));

create policy "members send club messages" on public.club_messages
  for insert to authenticated
  with check (sender_id = auth.uid() and public.is_active_club_member(club_id));

alter publication supabase_realtime add table public.club_messages;
