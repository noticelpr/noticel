-- NotiCel · personnel files in each person's Expediente (panel → Personal; user, 2026-11-17).
-- Contracts, IDs, evaluations… for periodistas, columnistas, Editors and the Editor en jefe. ONLY administrators see,
-- upload, download and delete them (not the Gerente, not the person). Run once in Supabase → SQL Editor (safe to run again).
create table if not exists hr_files (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade, -- whose expediente
  title text not null,
  kind text not null default 'Otro',
  path text not null,                                             -- in the private "expedientes" folder
  size integer,
  uploaded_by text,
  created_at timestamptz not null default now()
);
alter table hr_files enable row level security;
drop policy if exists "admins only" on hr_files;
create policy "admins only" on hr_files for all using (staff_role() = 'admin') with check (staff_role() = 'admin');
grant select, insert, delete on hr_files to authenticated;

-- The private folder: nobody can open a file without an administrator's sign-in
insert into storage.buckets (id, name, public, file_size_limit)
  values ('expedientes', 'expedientes', false, 20971520) on conflict (id) do update set public = false;
drop policy if exists "admins read expedientes" on storage.objects;
create policy "admins read expedientes" on storage.objects for select using (bucket_id = 'expedientes' and staff_role() = 'admin');
drop policy if exists "admins upload expedientes" on storage.objects;
create policy "admins upload expedientes" on storage.objects for insert with check (bucket_id = 'expedientes' and staff_role() = 'admin');
drop policy if exists "admins delete expedientes" on storage.objects;
create policy "admins delete expedientes" on storage.objects for delete using (bucket_id = 'expedientes' and staff_role() = 'admin');
