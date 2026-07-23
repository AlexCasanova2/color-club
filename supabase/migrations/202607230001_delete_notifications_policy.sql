drop policy if exists "users delete own notifications" on public.notifications;

create policy "users delete own notifications" on public.notifications
  for delete to authenticated
  using (user_id = auth.uid());
