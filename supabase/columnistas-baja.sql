-- NotiCel · removing a columnist and bringing one back (user, 2026-11-17). Run once in Supabase → SQL Editor (safe to run
-- again). Order: after supabase/columnistas-solicitudes.sql (the 'columnist' role).
-- Removing (panel → Columnistas → Cuentas de columnistas → Quitar acceso; administrator and Editor en jefe) takes away
-- their panel access and turns their Opiniones profile off; their columns stay published. They are kept here, so
-- "Traer de vuelta" can invite them again. Only the Edge Function "equipo" writes this table; the newsroom reads it.
create table if not exists columnist_removed (
  user_id uuid primary key references auth.users on delete cascade,
  name text not null default '',
  email text not null default '',
  removed_at timestamptz not null default now(),
  removed_by uuid references auth.users on delete set null,
  note text
);
alter table columnist_removed enable row level security;
drop policy if exists "newsroom reads removed columnists" on columnist_removed;
create policy "newsroom reads removed columnists" on columnist_removed for select using (staff_role() in ('admin', 'editor', 'desk'));
grant select on columnist_removed to authenticated;
