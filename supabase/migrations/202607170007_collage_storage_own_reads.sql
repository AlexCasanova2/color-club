create policy "owners read editable collage objects" on storage.objects
for select to authenticated
using (
  bucket_id = 'collages'
  and public.owns_participant(((storage.foldername(name))[1])::uuid)
);
