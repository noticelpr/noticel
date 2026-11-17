-- NotiCel · a columnist asks to take down one of their columns, and Mis columnas' reads (user, 2026-11-17).
-- Run once in Supabase → SQL Editor (safe to run again). Order: run supabase/columnistas-solicitudes.sql FIRST (it adds
-- the 'columnist' role), then this file. Needs supabase/anuncios-ventas.sql (story_reads) too.
-- Columnists can't delete or take down published columns: they ask from Mis columnas, and the administrator, the
-- Editor en jefe or an Editor decides in panel → Columnistas (take it off the site, or keep it).

create table if not exists column_takedowns (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  slug text not null,             -- the story's id on NotiCel (its file name: wp-123, wpa-123 or a panel-written one)
  title text not null default '',
  reason text not null default '',
  status text not null default 'pedida' check (status in ('pedida', 'quitada', 'mantenida')),
  reviewed_by uuid references auth.users on delete set null,
  reviewed_at timestamptz
);
-- The column's address on the site (its WordPress-style path), so the newsroom can open it from the request
alter table column_takedowns add column if not exists url text not null default '';
alter table column_takedowns enable row level security;
drop policy if exists "columnist asks" on column_takedowns;
create policy "columnist asks" on column_takedowns for insert
  with check (user_id = auth.uid() and staff_role() = 'columnist' and char_length(reason) <= 600 and char_length(title) <= 300
    and slug ~ '^[a-z0-9][a-z0-9-]{1,150}$' and (url = '' or url ~ '^/[^\s]{1,300}$') and status = 'pedida');
drop policy if exists "read takedowns" on column_takedowns;
create policy "read takedowns" on column_takedowns for select using (user_id = auth.uid() or staff_role() in ('admin', 'editor', 'desk'));
drop policy if exists "newsroom decides takedowns" on column_takedowns;
create policy "newsroom decides takedowns" on column_takedowns for update using (staff_role() in ('admin', 'editor', 'desk'));
grant select, insert, update on column_takedowns to authenticated;

-- The read counter takes NotiCel's story ids (wp-123, wpa-123, panel-written ones). The first version only took the
-- sister platform's date-style ids, so NotiCel's story pages never counted. Same rule otherwise: one total per story
-- and hour, nothing about the reader. The story pages call it after a few seconds, only on noticel.com.
create or replace function leer_noticia(s text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if s !~ '^[a-z0-9][a-z0-9-]{1,150}$' then return; end if;
  insert into story_reads (slug, hour, n) values (s, date_trunc('hour', now()), 1)
  on conflict (slug, hour) do update set n = story_reads.n + 1;
end $$;
grant execute on function leer_noticia(text) to anon, authenticated;

-- Mis columnas: reads per column and day, Puerto Rico time, for the columnist's chart and trend lines
-- (only totals, like noticias_leidas; the read counter keeps 30 days)
create or replace function lecturas_por_dia(slugs text[], dias integer default 30) returns table (s text, d date, total bigint)
language sql stable security definer set search_path = public as $$
  select slug, (hour at time zone 'America/Puerto_Rico')::date, sum(n) from story_reads
  where slug = any(slugs[1:300]) and hour >= now() - make_interval(days => least(greatest(dias, 1), 30))
  group by 1, 2;
$$;
grant execute on function lecturas_por_dia(text[], integer) to anon, authenticated;
