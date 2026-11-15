-- NotiCel · two-step sign-in for the panel: a 6-digit code by email on each new sign-in, and "Recordar este
-- dispositivo por 30 días" (from Noticias Xtra's seguridad.sql + recordar.sql, 2026-11-15).
-- RUN THIS LAST, only after: (1) the "codigo" function is deployed in Supabase, (2) RESEND_API_KEY and MAIL_FROM are
-- saved as Supabase secrets, and (3) a test code email reached you. Before that, this would lock everyone out of the panel.

-- ===== seguridad.sql =====
-- NotiCel · two-step verification for the team, with a code by email (run in Supabase → SQL Editor; safe to run
-- again, and it replaces the earlier phone-app version if that was run).
-- Each sign-in to the panel gets a 6-digit code by email (Edge Function "codigo", from noreply@noticel.com).
-- Until that sign-in types its code, it has no staff powers: every permission that checks the team list (staff table)
-- or staff_role() requires a sign-in verified in the last 24 hours.

-- 1. The codes: one row per sign-in (its session), only the Edge Function reads and writes it
create table if not exists staff_codes (
  session_id uuid primary key,
  user_id uuid not null references auth.users on delete cascade,
  code_hash text,
  expires_at timestamptz,
  tries integer not null default 0,
  sent_at timestamptz,
  verified_at timestamptz
);
alter table staff_codes enable row level security; -- no policies: nobody reads it from the site

-- 2. Did this sign-in type its code (in the last 24 hours)?
create or replace function sesion_verificada() returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from staff_codes
    where session_id = nullif(auth.jwt() ->> 'session_id', '')::uuid and user_id = auth.uid()
      and verified_at > now() - interval '24 hours'
  )
$$;
grant execute on function sesion_verificada() to authenticated;

-- 3. The team list: each person sees their own row only after the code. Every policy in the other SQL files that
--    asks "is this person on the team?" reads this table as the person, so all of them now need the code.
drop policy if exists "staff read themselves" on staff;
create policy "staff read themselves" on staff for select using (auth.uid() = user_id and sesion_verificada());

-- 4. The role check used by the panel's functions and many policies: no role without the code
create or replace function staff_role() returns text language sql stable security definer set search_path = public as $$
  select role from staff where user_id = auth.uid() and sesion_verificada()
$$;

-- 5. Before the code, the panel only needs to know "is this account on the team?" (yes/no)
create or replace function soy_equipo() returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from staff where user_id = auth.uid())
$$;
grant execute on function soy_equipo() to authenticated;

-- ===== recordar.sql =====
-- NotiCel · "Recordar este dispositivo por 30 días" for the email code (run once in Supabase → SQL Editor;
-- safe to run again). The team (panel) and readers with two-step on can skip the code for 30 days on a device they
-- choose. Only a hash of each device's key is kept; only the Edge Function "codigo" reads or writes this table.
create table if not exists trusted_devices (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users on delete cascade,
  token_hash text not null unique,
  label text not null default '',
  created_at timestamptz not null default now(),
  last_used_at timestamptz,
  expires_at timestamptz not null
);
alter table trusted_devices enable row level security; -- no policies: nobody reads it from the site
create index if not exists trusted_devices_user on trusted_devices (user_id);
-- Old ones clean themselves up when a new one is saved
create or replace function trusted_devices_cleanup() returns trigger language plpgsql security definer set search_path = public as $$
begin
  delete from trusted_devices where expires_at < now();
  return new;
end $$;
drop trigger if exists trusted_devices_cleanup on trusted_devices;
create trigger trusted_devices_cleanup after insert on trusted_devices for each statement execute function trusted_devices_cleanup();
