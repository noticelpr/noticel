-- Salud del sitio (staff panel): the numbers the page shows, and a log of failed publishing.
-- Run once in Supabase → SQL Editor. Safe to run again.

-- Failed publishing from the panel (publish, schedule, take down). Any staff member can add a line;
-- editors and the admin read them; the admin clears them.
create table if not exists panel_errors (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  who text not null default '' check (char_length(who) <= 60),
  what text not null check (char_length(what) <= 200),
  detail text not null default '' check (char_length(detail) <= 500)
);
alter table panel_errors enable row level security;
drop policy if exists "staff log errors" on panel_errors;
create policy "staff log errors" on panel_errors for insert with check (staff_role() is not null);
drop policy if exists "editors read errors" on panel_errors;
create policy "editors read errors" on panel_errors for select using (staff_role() in ('admin', 'editor'));
drop policy if exists "admin clears errors" on panel_errors;
create policy "admin clears errors" on panel_errors for delete using (staff_role() = 'admin');

-- Comments, accounts and storage in one call (editors and the admin only).
-- Comments the word filter blocks are never saved, so they can't be counted here.
create or replace function panel_stats() returns json
language plpgsql stable security definer set search_path = public, storage as $$
declare
  today timestamptz := date_trunc('day', now() at time zone 'America/Puerto_Rico') at time zone 'America/Puerto_Rico';
begin
  if coalesce(staff_role(), '') not in ('admin', 'editor') then
    raise exception 'Solo editores y el administrador.' using errcode = 'P0001';
  end if;
  return json_build_object(
    'comments_today', (select count(*) from comments where created_at >= today),
    'review_today', (select count(*) from comments where created_at >= today and status = 'review'),
    'review_now', (select count(*) from comments where status = 'review'),
    'removed_week', (select count(*) from comments where created_at >= now() - interval '7 days' and status = 'removed'),
    'signups_week', (select count(*) from profiles where created_at >= now() - interval '7 days'),
    'accounts', (select count(*) from profiles),
    'banned', (select count(*) from profiles where banned),
    'storage_bytes', (select coalesce(sum((metadata->>'size')::bigint), 0) from storage.objects),
    'db_bytes', pg_database_size(current_database())
  );
end $$;
revoke all on function panel_stats() from public;
grant execute on function panel_stats() to authenticated;
