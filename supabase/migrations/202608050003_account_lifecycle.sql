alter table public.challenges alter column created_by drop not null;
alter table public.challenges drop constraint if exists challenges_created_by_fkey;
alter table public.challenges add constraint challenges_created_by_fkey
  foreign key (created_by) references public.profiles(id) on delete set null;

alter table public.platform_admins drop constraint if exists platform_admins_user_id_fkey;
alter table public.platform_admins add constraint platform_admins_user_id_fkey
  foreign key (user_id) references auth.users(id) on delete cascade;

create table public.account_deletion_cleanup (
  id uuid primary key default gen_random_uuid(),
  deletion_id uuid not null,
  bucket text not null check (bucket in ('avatars', 'collages')),
  object_path text not null,
  ready boolean not null default false,
  created_at timestamptz not null default now(),
  unique (bucket, object_path)
);

create index account_deletion_cleanup_deletion_idx on public.account_deletion_cleanup(deletion_id);
alter table public.account_deletion_cleanup enable row level security;
revoke all on public.account_deletion_cleanup from anon, authenticated;
