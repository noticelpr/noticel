-- Columnist profiles (panel → Columnistas). Run once in Supabase → SQL Editor (it is safe to run again).
-- Everyone can read the profiles that are on ("active"); admins and editors create, edit and turn them on/off.
-- The site reads the profiles that are on each time it is built; turned-off columnists leave the Opiniones page.

create table if not exists columnists (
  slug text primary key,                 -- the profile address: /opinion/<slug>/
  name text not null,                    -- exactly as it appears as the author of their columns
  role text not null default 'Columnista', -- position shown under the name (e.g. "Abogado y analista político")
  bio text,
  photo text,                            -- picture address (uploaded in the panel or a link)
  email text,                            -- public contact, optional
  x text, instagram text, facebook text, website text, -- social links, optional
  active boolean not null default true,  -- on: shows on the site; off: hidden
  sort integer not null default 0,
  updated_at timestamptz not null default now()
);
alter table columnists enable row level security;
drop policy if exists "public reads active columnists" on columnists;
create policy "public reads active columnists" on columnists for select using (active or exists (select 1 from staff where user_id = auth.uid() and role in ('admin','editor')));
drop policy if exists "editors add columnists" on columnists;
create policy "editors add columnists" on columnists for insert with check (exists (select 1 from staff where user_id = auth.uid() and role in ('admin','editor')));
drop policy if exists "editors edit columnists" on columnists;
create policy "editors edit columnists" on columnists for update using (exists (select 1 from staff where user_id = auth.uid() and role in ('admin','editor')));
grant select on columnists to anon, authenticated;
grant insert, update on columnists to authenticated;

-- Photos: a public "columnistas" folder; admins and editors upload
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values ('columnistas', 'columnistas', true, 5242880, array['image/jpeg','image/png','image/webp']) on conflict do nothing;
drop policy if exists "editors upload columnist photos" on storage.objects;
create policy "editors upload columnist photos" on storage.objects for insert
  with check (bucket_id = 'columnistas' and exists (select 1 from staff where user_id = auth.uid() and role in ('admin','editor')));

-- The columnists already on the site (from the WordPress export), so nothing disappears
insert into columnists (slug, name, role, bio, photo, active, sort) values
  ('luisito-vigoreaux', 'Luisito Vigoreaux', 'Columnista', null, null, true, 1),
  ('lcdo-ramon-alejandro-pabon', 'Lcdo. Ramón Alejandro Pabón', 'Columnista', null, null, true, 2),
  ('carlos-salgado', 'Carlos Salgado', 'Columnista', null, null, true, 3),
  ('enid-m-gavilan', 'Enid M. Gavilán', 'Columnista', null, null, true, 4),
  ('heriberto-n-sauri', 'Heriberto N. Saurí', 'Columnista', null, null, true, 5),
  ('lcda-lisoannette-gonzalez', 'Lcda. Lisoannette González', 'Columnista', null, null, true, 6),
  ('lcdo-josue-cardona-hernandez', 'Lcdo Josué Cardona Hernández', 'Columnista', null, null, true, 7),
  ('carlos-narvaez', 'Carlos Narvaez', 'Columnista', null, null, true, 8),
  ('lcdo-walter-perez', 'Lcdo. Walter Pérez', 'Columnista', null, null, true, 9)
on conflict (slug) do nothing;
