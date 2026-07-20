create or replace function public.save_participant_photo(
  target_participant_id uuid,
  target_slot smallint,
  target_photo_url text
)
returns void
language plpgsql
security definer set search_path = ''
as $$
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if target_slot < 1 or target_slot > 6 then raise exception 'Slot inválido'; end if;
  if not public.can_edit_participant(target_participant_id) then
    raise exception 'No puedes editar este collage';
  end if;

  insert into public.photos (participant_id, slot_order, photo_url)
  values (target_participant_id, target_slot, target_photo_url)
  on conflict (participant_id, slot_order)
  do update set photo_url = excluded.photo_url;
end;
$$;

grant execute on function public.save_participant_photo(uuid, smallint, text) to authenticated;
