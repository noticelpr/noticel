-- NotiCel · "¿Quieres ser columnista?" (user, 2026-11-17). Run once in Supabase → SQL Editor (safe to run again).
-- Order: run this file FIRST, then supabase/columnas-quitar.sql (it needs the 'columnist' role added here).
-- Needs supabase/panel-equipo.sql (staff_role(), the Editor 'desk' role) and supabase/columnistas.sql (columnists).
-- 1. Anyone can apply from the Opiniones page (/category/opiniones/): name, email, profession, topics, a short bio.
-- 2. The request shows in panel → Columnistas for the administrator, the Editor en jefe and the Editors.
-- 3. Approving it invites the person (Edge Function "equipo") with the new role "columnist" (Columnista): they can
--    only write Opiniones columns (an editor approves each one) and see their own columns' readers and comments.

-- The new role (NotiCel's seven roles, plus Columnista)
alter table staff drop constraint if exists staff_role_check;
alter table staff add constraint staff_role_check check (role in ('admin', 'editor', 'ads', 'reporter', 'manager', 'desk', 'photo', 'columnist'));

-- Editors (desk) manage the profiles too, so they can approve columnists. The owner rules from perfiles
-- (panel-equipo.sql: each team member reads and edits their own profile) stay as they are.
drop policy if exists "public reads active columnists" on columnists;
create policy "public reads active columnists" on columnists for select
  using (active or owner = auth.uid() or staff_role() in ('admin', 'editor', 'desk'));
drop policy if exists "editors add columnists" on columnists;
create policy "editors add columnists" on columnists for insert with check (staff_role() in ('admin', 'editor', 'desk'));
drop policy if exists "editors edit columnists" on columnists;
create policy "editors edit columnists" on columnists for update using (staff_role() in ('admin', 'editor', 'desk'));

-- The requests
create table if not exists columnist_requests (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  name text not null,
  email text not null,
  phone text,
  profession text not null,
  topics text not null,
  bio text not null,
  links text,
  sample text, -- not asked anymore (user, 2026-11-17); kept so the function's signature matches the sister platform
  status text not null default 'nueva' check (status in ('nueva', 'aprobada', 'rechazada')),
  reviewed_by uuid references auth.users on delete set null,
  reviewed_at timestamptz,
  note text
);
alter table columnist_requests enable row level security;
drop policy if exists "newsroom reads requests" on columnist_requests;
create policy "newsroom reads requests" on columnist_requests for select using (staff_role() in ('admin', 'editor', 'desk'));
drop policy if exists "newsroom answers requests" on columnist_requests;
create policy "newsroom answers requests" on columnist_requests for update using (staff_role() in ('admin', 'editor', 'desk'));
grant select, update on columnist_requests to authenticated;

-- Applying (anyone; checked here so the form can't be abused): one open request per email, at most 3 per email in
-- 30 days and 60 a day in all. Returns 'ok' or a message for the person.
create or replace function solicitar_columna(nombre text, correo text, telefono text, profesion text, temas text, bio text, enlaces text, muestra text)
returns text language plpgsql security definer set search_path = public as $$
declare e text := lower(trim(correo));
begin
  if length(trim(nombre)) < 3 or length(nombre) > 80 then return 'Escribe tu nombre completo.'; end if;
  if e !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' or length(e) > 120 then return 'Escribe un correo válido.'; end if;
  if length(trim(profesion)) < 2 or length(profesion) > 120 then return 'Escribe tu profesión u ocupación.'; end if;
  if length(trim(temas)) < 5 or length(temas) > 400 then return 'Cuéntanos de qué temas escribirías.'; end if;
  if length(trim(bio)) < 20 or length(bio) > 1200 then return 'Escribe unas líneas sobre ti (al menos 20 letras).'; end if;
  if length(coalesce(telefono, '')) > 30 or length(coalesce(enlaces, '')) > 600 or length(coalesce(muestra, '')) > 6000 then return 'Algún campo es demasiado largo.'; end if;
  if exists (select 1 from columnist_requests where email = e and status = 'nueva') then return 'Ya recibimos tu solicitud. La redacción te escribirá.'; end if;
  if (select count(*) from columnist_requests where email = e and created_at > now() - interval '30 days') >= 3 then return 'Ya enviaste varias solicitudes este mes. Intenta más adelante.'; end if;
  if (select count(*) from columnist_requests where created_at > now() - interval '1 day') >= 60 then return 'Recibimos muchas solicitudes hoy. Intenta mañana.'; end if;
  insert into columnist_requests (name, email, phone, profession, topics, bio, links, sample)
  values (trim(nombre), e, nullif(trim(telefono), ''), trim(profesion), trim(temas), trim(bio), nullif(trim(enlaces), ''), nullif(trim(muestra), ''));
  return 'ok';
end $$;
grant execute on function solicitar_columna(text, text, text, text, text, text, text, text) to anon, authenticated;

-- The Equipo role menu (administrator) can also make someone a columnist (NotiCel's roles, Fotoperiodista included)
create or replace function staff_add(handle text, display text, new_role text) returns text
language plpgsql security definer set search_path = public as $$
declare uid uuid;
begin
  if staff_role() is distinct from 'admin' then return 'Solo el administrador puede añadir personas.'; end if;
  if new_role not in ('admin', 'editor', 'ads', 'reporter', 'manager', 'desk', 'photo', 'columnist') then return 'Ese rol no existe.'; end if;
  select id into uid from profiles where username = lower(ltrim(handle, '@'));
  if uid is null then select id into uid from auth.users where lower(email) = lower(handle); end if;
  if uid is null then return 'No encontramos esa cuenta. Pídele que primero cree su cuenta en el sitio.'; end if;
  insert into staff (user_id, name, role) values (uid, coalesce(nullif(display, ''), handle), new_role)
  on conflict (user_id) do update set name = excluded.name, role = excluded.role;
  return 'ok';
end $$;
