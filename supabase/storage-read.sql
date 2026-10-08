-- NotiCel: lets staff read the files in the "anuncios" and "noticias" storage buckets (run once in SQL Editor).
-- Supabase needs this read permission when an upload replaces a file with the same name (ad images use fixed names).
create policy "staff read uploaded files" on storage.objects for select
  using (bucket_id in ('anuncios', 'noticias') and staff_role() is not null);
