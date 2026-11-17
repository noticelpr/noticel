-- NotiCel · the administrator can delete a columnist profile for good (panel → Columnistas → Editar → Borrar perfil;
-- owner, 2026-11-17). Run once in Supabase → SQL Editor (safe to run again). Their published columns are not touched.
drop policy if exists "admin deletes columnists" on columnists;
create policy "admin deletes columnists" on columnists for delete using (staff_role() = 'admin');
grant delete on columnists to authenticated;
