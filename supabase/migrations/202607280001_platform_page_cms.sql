do $$
begin
  create type public.platform_admin_role as enum ('support', 'moderator', 'owner');
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create type public.platform_admin_status as enum ('active', 'inactive');
exception
  when duplicate_object then null;
end $$;

create table if not exists public.platform_admins (
  user_id uuid primary key references auth.users(id) on delete restrict,
  role public.platform_admin_role not null,
  status public.platform_admin_status not null default 'active',
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.site_page_content (
  route text primary key check (route in ('/', '/como-funciona', '/soporte', '/privacidad', '/terminos')),
  seo_title text not null check (char_length(seo_title) between 4 and 70),
  seo_description text not null check (char_length(seo_description) between 20 and 180),
  hero_kicker text not null check (char_length(hero_kicker) between 2 and 40),
  hero_title text not null check (char_length(hero_title) between 4 and 90),
  hero_body text not null check (char_length(hero_body) between 20 and 320),
  published boolean not null default true,
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

alter table public.site_page_content
drop constraint if exists site_page_content_seo_title_check;

alter table public.site_page_content
add constraint site_page_content_seo_title_check
check (char_length(seo_title) between 4 and 70);

alter table public.site_page_content
drop constraint if exists site_page_content_seo_description_check;

alter table public.site_page_content
add constraint site_page_content_seo_description_check
check (char_length(seo_description) between 20 and 180);

create table if not exists public.platform_admin_audit_log (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references auth.users(id) on delete set null,
  actor_role public.platform_admin_role,
  action text not null check (char_length(action) between 3 and 80),
  resource_type text not null check (char_length(resource_type) between 3 and 80),
  resource_id text not null check (char_length(resource_id) between 1 and 160),
  reason text not null check (char_length(trim(reason)) between 6 and 500),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.platform_admins enable row level security;
alter table public.site_page_content enable row level security;
alter table public.platform_admin_audit_log enable row level security;

create or replace function public.current_platform_admin_role()
returns public.platform_admin_role
language sql
stable
security definer set search_path = ''
as $$
  select pa.role
  from public.platform_admins pa
  where pa.user_id = auth.uid()
    and pa.status = 'active'
  limit 1;
$$;

create or replace function public.has_platform_admin_role(required_role public.platform_admin_role)
returns boolean
language sql
stable
security definer set search_path = ''
as $$
  select case
    when public.current_platform_admin_role() = 'owner' then true
    when public.current_platform_admin_role() = 'moderator' and required_role in ('support', 'moderator') then true
    when public.current_platform_admin_role() = 'support' and required_role = 'support' then true
    else false
  end;
$$;

create policy "site page content public read"
on public.site_page_content for select
using (published = true or public.has_platform_admin_role('support'));

create policy "platform admins self read"
on public.platform_admins for select
using (user_id = auth.uid() or public.has_platform_admin_role('owner'));

create policy "platform audit owner read"
on public.platform_admin_audit_log for select
using (public.has_platform_admin_role('owner'));

create or replace function public.admin_upsert_site_page_content(
  target_route text,
  next_seo_title text,
  next_seo_description text,
  next_hero_kicker text,
  next_hero_title text,
  next_hero_body text,
  next_published boolean,
  change_reason text
)
returns public.site_page_content
language plpgsql
security definer set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  actor_role public.platform_admin_role;
  changed_row public.site_page_content;
begin
  actor_role := public.current_platform_admin_role();

  if actor is null or actor_role is distinct from 'owner' then
    raise exception 'not authorized';
  end if;

  if char_length(trim(change_reason)) < 6 then
    raise exception 'change reason is required';
  end if;

  insert into public.site_page_content (
    route,
    seo_title,
    seo_description,
    hero_kicker,
    hero_title,
    hero_body,
    published,
    updated_by,
    updated_at
  ) values (
    target_route,
    trim(next_seo_title),
    trim(next_seo_description),
    trim(next_hero_kicker),
    trim(next_hero_title),
    trim(next_hero_body),
    next_published,
    actor,
    now()
  )
  on conflict (route) do update set
    seo_title = excluded.seo_title,
    seo_description = excluded.seo_description,
    hero_kicker = excluded.hero_kicker,
    hero_title = excluded.hero_title,
    hero_body = excluded.hero_body,
    published = excluded.published,
    updated_by = excluded.updated_by,
    updated_at = excluded.updated_at
  returning * into changed_row;

  insert into public.platform_admin_audit_log (
    actor_id,
    actor_role,
    action,
    resource_type,
    resource_id,
    reason,
    metadata
  ) values (
    actor,
    actor_role,
    'site_page_content.upsert',
    'site_page_content',
    target_route,
    trim(change_reason),
    jsonb_build_object('published', next_published)
  );

  return changed_row;
end;
$$;

revoke all on public.platform_admins from anon, authenticated;
revoke all on public.site_page_content from anon, authenticated;
revoke all on public.platform_admin_audit_log from anon, authenticated;

grant select on public.site_page_content to anon, authenticated;
grant select on public.platform_admins to authenticated;
grant select on public.platform_admin_audit_log to authenticated;

revoke execute on function public.current_platform_admin_role() from public, anon, authenticated;
revoke execute on function public.has_platform_admin_role(public.platform_admin_role) from public, anon, authenticated;
revoke execute on function public.admin_upsert_site_page_content(text, text, text, text, text, text, boolean, text) from public, anon, authenticated;

grant execute on function public.current_platform_admin_role() to authenticated;
grant execute on function public.has_platform_admin_role(public.platform_admin_role) to authenticated;
grant execute on function public.admin_upsert_site_page_content(text, text, text, text, text, text, boolean, text) to authenticated;

insert into public.site_page_content (route, seo_title, seo_description, hero_kicker, hero_title, hero_body)
values
  ('/', 'Retos de color con tus amigos', 'Crea un club privado, recibe un color, fotografía lo que encuentres y votad vuestros collages.', 'Retos de color con tus amigos', 'Sal a buscar tu color.', 'Crea un club, recibe un color, fotografía lo que encuentres y montad collages que nadie verá antes de tiempo.'),
  ('/como-funciona', 'Cómo funciona', 'Recorre paso a paso los clubs, retos, collages, votaciones y rankings de Color Club.', 'Cómo funciona', 'Un color cambia la forma de mirar.', 'Color Club empieza con un grupo privado y termina con una clasificación. En medio, cada persona sale a encontrar su propia respuesta al mismo color.'),
  ('/soporte', 'Soporte', 'Respuestas sobre clubs, collages, votaciones, cuenta y notificaciones de Color Club.', 'Soporte', 'Una respuesta antes del siguiente reto.', 'Clubs, tiempos, envíos, votos y cuenta. Hemos reunido las dudas que pueden bloquear una partida para resolverlas sin rodeos.'),
  ('/privacidad', 'Política de privacidad', 'Política de privacidad de Color Club.', 'Privacidad', 'Política de privacidad.', 'Documento pendiente de revisión y aprobación legal.'),
  ('/terminos', 'Términos de uso', 'Términos de uso de Color Club.', 'Términos', 'Reglas de uso.', 'Documento pendiente de revisión y aprobación legal.')
on conflict (route) do nothing;
