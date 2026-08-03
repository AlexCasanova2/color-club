drop policy if exists "site page content public read" on public.site_page_content;

create policy "site page content published read"
on public.site_page_content
for select
to anon
using (published = true);

create policy "site page content authenticated read"
on public.site_page_content
for select
to authenticated
using (published = true or public.has_platform_admin_role('support'));
