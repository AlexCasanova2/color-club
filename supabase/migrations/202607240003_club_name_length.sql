create or replace function public.validate_club_name_length()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if char_length(trim(new.name)) < 2 or char_length(trim(new.name)) > 20 then
    raise exception 'El nombre del club debe tener entre 2 y 20 caracteres';
  end if;
  new.name := trim(new.name);
  return new;
end;
$$;

drop trigger if exists clubs_validate_name_length on public.clubs;
create trigger clubs_validate_name_length
before insert or update of name on public.clubs
for each row execute function public.validate_club_name_length();

revoke all on function public.validate_club_name_length() from public, anon, authenticated;
