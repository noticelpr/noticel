-- NotiCel: "Borrar mi cuenta" (Mi perfil → Ajustes). Run once in Supabase → SQL Editor. Safe to run again.
-- Deleting the account removes the profile and, through the tables' links, everything tied to it: comments, likes,
-- reports, notifications, Foro topics and replies, saved stories, game points and the staff role. The site first
-- deletes the reader's own photos (profile photo and photos in comments) from storage.

-- Readers can see and delete only their own files (their folder is their account id)
drop policy if exists "own files read" on storage.objects;
create policy "own files read" on storage.objects for select to authenticated
  using (bucket_id in ('avatars', 'comentarios') and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "own files delete" on storage.objects;
create policy "own files delete" on storage.objects for delete to authenticated
  using (bucket_id in ('avatars', 'comentarios') and (storage.foldername(name))[1] = auth.uid()::text);

create or replace function delete_my_account() returns text language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid();
begin
  if uid is null then return 'Entra a tu cuenta primero.'; end if;
  -- The site always needs at least one administrator
  if exists (select 1 from staff where user_id = uid and role = 'admin') and (select count(*) from staff where role = 'admin') <= 1 then
    return 'Eres el único administrador. Nombra a otra persona como administrador en el panel (Equipo) antes de borrar tu cuenta.';
  end if;
  delete from auth.users where id = uid; -- the profile and everything linked to it go with it
  return 'ok';
end $$;
revoke all on function delete_my_account() from public, anon;
grant execute on function delete_my_account() to authenticated;
