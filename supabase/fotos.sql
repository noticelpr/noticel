-- NotiCel: photo library (panel → Fotos, and "Elegir de la biblioteca" in Escribir). Run once in Supabase →
-- SQL Editor. Safe to run again.
-- This table is the library's index: what each photo shows and where its files are. The files themselves can live
-- anywhere (today the "noticias" storage bucket; later Cloudflare R2, Cloudinary or another service): only `src`
-- and `thumb` point there, so changing storage never changes the search.

create extension if not exists pg_trgm; -- fast "contains" search, even with 100,000 photos

create table if not exists photos (
  id uuid primary key default gen_random_uuid(),
  src text not null,                 -- the web version (about 2000 px)
  thumb text not null,               -- the small version for the grid (about 480 px)
  width int, height int,
  caption text not null default '',  -- what the photo shows (the story's caption)
  credit text not null default '',   -- "Foto: Nombre / NotiCel"
  credit_url text not null default '',
  place text not null default '',    -- e.g. San Juan, Capitolio
  people text not null default '',   -- who appears
  tags text not null default '',     -- words to find it, separated by commas
  taken_on date,                     -- when it was taken (if known)
  storage text not null default 'supabase', -- where the files are: supabase, r2, cloudinary, drive...
  path text,                         -- the file's name in that storage (to delete it)
  uploaded_by uuid default auth.uid() references auth.users on delete set null,
  uploaded_by_name text,
  created_at timestamptz not null default now(),
  -- Everything searchable in one lowercase, accent-free text (search sends the words the same way)
  search text generated always as (
    translate(lower(caption || ' ' || credit || ' ' || place || ' ' || people || ' ' || tags), 'áéíóúüñàèìòù', 'aeiouunaeiou')
  ) stored
);
create index if not exists photos_search on photos using gin (search gin_trgm_ops);
create index if not exists photos_created on photos (created_at desc);

alter table photos enable row level security;
-- The whole team can see and add photos; whoever uploaded a photo (or an editor/admin) can change it; editors and the
-- admin can delete
drop policy if exists "staff see photos" on photos;
create policy "staff see photos" on photos for select using (staff_role() is not null);
drop policy if exists "staff add photos" on photos;
create policy "staff add photos" on photos for insert with check (staff_role() is not null and uploaded_by = auth.uid());
drop policy if exists "staff edit photos" on photos;
create policy "staff edit photos" on photos for update using (uploaded_by = auth.uid() or staff_role() in ('admin', 'editor'));
drop policy if exists "editors delete photos" on photos;
create policy "editors delete photos" on photos for delete using (staff_role() in ('admin', 'editor'));

-- Deleting a photo also removes its files from the "noticias" bucket (library files live in noticias/biblioteca/)
drop policy if exists "editors delete library files" on storage.objects;
create policy "editors delete library files" on storage.objects for delete
  using (bucket_id = 'noticias' and (storage.foldername(name))[1] = 'biblioteca' and staff_role() in ('admin', 'editor'));
