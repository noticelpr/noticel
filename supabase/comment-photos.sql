-- NotiCel: photos in comments (shown small, like Instagram). Run once in Supabase → SQL Editor. Safe to run again.
-- Each reader uploads only into their own folder (comentarios/<their id>/...); anyone can view them.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('comentarios', 'comentarios', true, 3145728, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set public = true, file_size_limit = 3145728, allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp'];
drop policy if exists "own comment photo upload" on storage.objects;
create policy "own comment photo upload" on storage.objects for insert to authenticated
  with check (bucket_id = 'comentarios' and (storage.foldername(name))[1] = auth.uid()::text);
