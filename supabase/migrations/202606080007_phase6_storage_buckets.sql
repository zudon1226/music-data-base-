-- Phase 6 - Storage Buckets For Launch
-- Run after the main Phase 6 launch-readiness migration.
-- Adds missing launch buckets and safe storage policies without changing existing app logic.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('covers', 'covers', true, 20971520, array['image/jpeg', 'image/png', 'image/webp', 'image/gif']),
  ('albums', 'albums', true, 52428800, null),
  ('producer-beats', 'producer-beats', true, 104857600, null),
  ('licenses', 'licenses', false, 20971520, array['application/pdf']),
  ('downloads', 'downloads', false, 2147483648, null)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Public read launch artwork buckets" on storage.objects;
create policy "Public read launch artwork buckets"
on storage.objects
for select
using (bucket_id in ('covers', 'albums', 'producer-beats'));

drop policy if exists "Users can upload launch artwork to own folder" on storage.objects;
create policy "Users can upload launch artwork to own folder"
on storage.objects
for insert
to authenticated
with check (
  bucket_id in ('covers', 'albums', 'producer-beats')
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "Users can update launch artwork in own folder" on storage.objects;
create policy "Users can update launch artwork in own folder"
on storage.objects
for update
to authenticated
using (
  bucket_id in ('covers', 'albums', 'producer-beats')
  and (storage.foldername(name))[1] = auth.uid()::text
)
with check (
  bucket_id in ('covers', 'albums', 'producer-beats')
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "Users can delete launch artwork in own folder" on storage.objects;
create policy "Users can delete launch artwork in own folder"
on storage.objects
for delete
to authenticated
using (
  bucket_id in ('covers', 'albums', 'producer-beats')
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "Users can read private launch files in own folder" on storage.objects;
create policy "Users can read private launch files in own folder"
on storage.objects
for select
to authenticated
using (
  bucket_id in ('licenses', 'downloads')
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "Users can upload private launch files to own folder" on storage.objects;
create policy "Users can upload private launch files to own folder"
on storage.objects
for insert
to authenticated
with check (
  bucket_id in ('licenses', 'downloads')
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "Users can update private launch files in own folder" on storage.objects;
create policy "Users can update private launch files in own folder"
on storage.objects
for update
to authenticated
using (
  bucket_id in ('licenses', 'downloads')
  and (storage.foldername(name))[1] = auth.uid()::text
)
with check (
  bucket_id in ('licenses', 'downloads')
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "Users can delete private launch files in own folder" on storage.objects;
create policy "Users can delete private launch files in own folder"
on storage.objects
for delete
to authenticated
using (
  bucket_id in ('licenses', 'downloads')
  and (storage.foldername(name))[1] = auth.uid()::text
);
