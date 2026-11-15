-- Photo library, version 2 (2026-11-15): like PhotoShelter, and better. Run once in Supabase → SQL Editor, after
-- setup-noticel.sql (safe to run again).
--   · New role "Fotoperiodista" (photo): uploads and organizes photos, nothing else in the panel.
--   · Some reporters can also upload photos: the administrator turns on "Puede subir fotos" for each one.
--   · Albums by event (like PhotoShelter's galleries), usage rights, star rating, the original file kept for download,
--     the photographer's name, camera details, and a fingerprint so the same photo isn't uploaded twice.

-- 1. The new role
alter table staff drop constraint if exists staff_role_check;
alter table staff add constraint staff_role_check check (role in ('admin', 'editor', 'ads', 'reporter', 'photo'));
alter table staff add column if not exists can_upload_photos boolean not null default false;

-- Who can add photos: administrators, editors, photojournalists, and reporters the administrator allowed
create or replace function can_add_photos() returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from staff where user_id = auth.uid() and (role in ('admin', 'editor', 'photo') or (role = 'reporter' and can_upload_photos)))
$$;

-- The team list (panel → Equipo) also tells who can upload photos
drop function if exists staff_list();
create or replace function staff_list() returns table (user_id uuid, name text, role text, username text, email text, can_upload_photos boolean)
language sql stable security definer set search_path = public as $$
  select s.user_id, s.name, s.role, p.username, u.email::text, s.can_upload_photos
  from staff s left join profiles p on p.id = s.user_id left join auth.users u on u.id = s.user_id
  where staff_role() is not null order by s.name;
$$;
-- The administrator can now also give the Fotoperiodista role
create or replace function staff_add(handle text, display text, new_role text) returns text
language plpgsql security definer set search_path = public as $$
declare uid uuid;
begin
  if staff_role() is distinct from 'admin' then return 'Solo el administrador puede añadir personas.'; end if;
  if new_role not in ('admin', 'editor', 'ads', 'reporter', 'photo') then return 'Ese rol no existe.'; end if;
  select id into uid from profiles where username = lower(ltrim(handle, '@'));
  if uid is null then select id into uid from auth.users where lower(email) = lower(handle); end if;
  if uid is null then return 'No encontramos esa cuenta. Pídele que primero cree su cuenta en el sitio.'; end if;
  insert into staff (user_id, name, role) values (uid, coalesce(nullif(display, ''), handle), new_role)
  on conflict (user_id) do update set name = excluded.name, role = excluded.role;
  return 'ok';
end $$;
-- The administrator turns "Puede subir fotos" on or off for a reporter
create or replace function staff_set_photos(member uuid, allow boolean) returns text
language plpgsql security definer set search_path = public as $$
begin
  if staff_role() is distinct from 'admin' then return 'Solo el administrador puede cambiar esto.'; end if;
  update staff set can_upload_photos = allow where user_id = member;
  return 'ok';
end $$;
-- Each person can read their own "Puede subir fotos" (the panel shows or hides the upload button)
create or replace function my_staff() returns table (name text, role text, can_upload_photos boolean)
language sql stable security definer set search_path = public as $$
  select name, role, can_upload_photos from staff where user_id = auth.uid()
$$;
grant execute on function can_add_photos(), staff_list(), staff_add(text, text, text), staff_set_photos(uuid, boolean), my_staff() to authenticated;

-- 2. Albums by event (like PhotoShelter's galleries)
create table if not exists photo_albums (
  id uuid primary key default gen_random_uuid(),
  name text not null,                -- e.g. "Elecciones 2028 · Noche de escrutinio"
  event_date date,
  place text not null default '',
  notes text not null default '',
  cover text,                        -- a photo's thumbnail, for the album list
  created_by uuid default auth.uid() references auth.users on delete set null,
  created_by_name text,
  created_at timestamptz not null default now()
);
alter table photo_albums enable row level security;
drop policy if exists "staff see albums" on photo_albums;
create policy "staff see albums" on photo_albums for select using (staff_role() is not null);
drop policy if exists "uploaders add albums" on photo_albums;
create policy "uploaders add albums" on photo_albums for insert with check (can_add_photos());
drop policy if exists "owners edit albums" on photo_albums;
create policy "owners edit albums" on photo_albums for update using (created_by = auth.uid() or staff_role() in ('admin', 'editor'));
drop policy if exists "editors delete albums" on photo_albums;
create policy "editors delete albums" on photo_albums for delete using (staff_role() in ('admin', 'editor'));

-- 3. More about each photo
alter table photos add column if not exists album_id uuid references photo_albums on delete set null;
alter table photos add column if not exists photographer text not null default '';   -- who took it (from the camera or typed)
alter table photos add column if not exists rights text not null default 'propia'     -- propia, agencia, cedida, libre, archivo
  check (rights in ('propia', 'agencia', 'cedida', 'libre', 'archivo'));
alter table photos add column if not exists rights_note text not null default '';    -- e.g. "EFE, solo uso editorial"
alter table photos add column if not exists rights_until date;                       -- when the permission ends, if it does
alter table photos add column if not exists rating smallint not null default 0 check (rating between 0 and 5);
alter table photos add column if not exists sensitive boolean not null default false; -- graphic content: shown blurred in the grid
alter table photos add column if not exists original text;                           -- the full-size original, for download
alter table photos add column if not exists original_path text;
alter table photos add column if not exists camera text not null default '';          -- camera and lens, from the photo itself
alter table photos add column if not exists hash text;                                -- fingerprint: the same photo isn't uploaded twice
create index if not exists photos_album on photos (album_id);
create index if not exists photos_hash on photos (hash);
create index if not exists photos_taken on photos (taken_on desc);

-- Search also covers the photographer, the album's notes are separate; rebuild the searchable text
alter table photos drop column if exists search;
alter table photos add column search text generated always as (
  translate(lower(caption || ' ' || credit || ' ' || place || ' ' || people || ' ' || tags || ' ' || photographer || ' ' || camera || ' ' || rights_note),
    'áéíóúüñàèìòù', 'aeiouunaeiou')
) stored;
create index if not exists photos_search on photos using gin (search gin_trgm_ops);

-- Who can add photos now: administrators, editors, photojournalists and the reporters allowed to
drop policy if exists "staff add photos" on photos;
create policy "staff add photos" on photos for insert with check (can_add_photos() and uploaded_by = auth.uid());
drop policy if exists "staff upload story files" on storage.objects;
create policy "staff upload story files" on storage.objects for insert
  with check (bucket_id = 'noticias' and staff_role() is not null);
