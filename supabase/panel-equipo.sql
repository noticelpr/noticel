-- NotiCel · the panel and the team, like Noticias Xtra (2026-11-15). Run ONCE in Supabase → SQL Editor → New query →
-- paste → Run (safe to run again). Needs setup-noticel.sql, fotos-v2.sql and columnistas.sql first (already run).
-- What it adds: team activity (who's in the panel now), the owner account (publisher@noticel.com) and hidden members,
-- the Gerente (sales manager) and Editor (desk) roles, Memos, Documentos, Personal (days off, staff records), invoices,
-- the activity log, commissions (rates stay 0 until the owner sets them in the panel), and each team member's public
-- profile. NotiCel's own pieces are kept: the Fotoperiodista role and "Puede subir fotos" (end of this file).
-- Not here on purpose: the two-step email code (seguridad.sql + recordar.sql) runs later, after the "codigo" function
-- and the email service are set up; otherwise the panel would lock everyone out.

-- ==================================================================
-- actividad.sql (from Noticias Xtra)
-- ==================================================================
-- NotiCel · team activity in the panel (run once in Supabase → SQL Editor; safe to run again).
-- While someone on the team has the panel open (and the tab in front), it checks in once a minute. Each check-in
-- counts one active minute for that day (Puerto Rico time). The administrator sees, in Equipo: who is in the panel
-- now, last activity, active time today and in the last 7 days. Nobody else can read it.

create table if not exists staff_activity (
  user_id uuid not null references auth.users on delete cascade,
  day date not null,
  minutes integer not null default 0,
  first_seen timestamptz not null default now(),
  last_seen timestamptz not null default now(),
  primary key (user_id, day)
);
alter table staff_activity enable row level security; -- no policies: only the two functions below touch it

-- One check-in from the panel: counts a minute if the previous check-in was recent (the panel was really open)
create or replace function staff_ping() returns void language plpgsql security definer set search_path = public as $$
declare today date := (now() at time zone 'America/Puerto_Rico')::date;
begin
  if staff_role() is null then return; end if;
  insert into staff_activity (user_id, day, minutes) values (auth.uid(), today, 1)
  on conflict (user_id, day) do update
    set minutes = staff_activity.minutes + case when now() - staff_activity.last_seen between interval '40 seconds' and interval '3 minutes' then 1 else 0 end,
        last_seen = now();
end $$;
grant execute on function staff_ping() to authenticated;

-- For the administrator: each person's last activity, minutes today and in the last 7 days
create or replace function staff_activity_list() returns table (user_id uuid, last_seen timestamptz, today_minutes integer, week_minutes integer, today_first timestamptz)
language sql stable security definer set search_path = public as $$
  select a.user_id, max(a.last_seen),
         coalesce(sum(a.minutes) filter (where a.day = (now() at time zone 'America/Puerto_Rico')::date), 0)::int,
         coalesce(sum(a.minutes) filter (where a.day > (now() at time zone 'America/Puerto_Rico')::date - 7), 0)::int,
         min(a.first_seen) filter (where a.day = (now() at time zone 'America/Puerto_Rico')::date)
  from staff_activity a
  where staff_role() = 'admin'
  group by a.user_id
$$;
grant execute on function staff_activity_list() to authenticated;

-- ==================================================================
-- dueno.sql (from Noticias Xtra)
-- ==================================================================
-- NotiCel · the owner's account (run once in Supabase → SQL Editor; safe to run again).
-- The owner (publisher@noticel.com) sees everyone's activity in Equipo; other administrators don't see the owner's
-- (online now, active time, last sign-in). Nobody but the owner can remove the owner, change the owner's role or
-- take the owner mark away.

alter table staff add column if not exists is_owner boolean not null default false;
update staff set is_owner = true where user_id = (select id from auth.users where lower(email) = 'publisher@noticel.com');

-- Activity for administrators: the owner's own rows only for the owner
create or replace function staff_activity_list() returns table (user_id uuid, last_seen timestamptz, today_minutes integer, week_minutes integer, today_first timestamptz)
language sql stable security definer set search_path = public as $$
  select a.user_id, max(a.last_seen),
         coalesce(sum(a.minutes) filter (where a.day = (now() at time zone 'America/Puerto_Rico')::date), 0)::int,
         coalesce(sum(a.minutes) filter (where a.day > (now() at time zone 'America/Puerto_Rico')::date - 7), 0)::int,
         min(a.first_seen) filter (where a.day = (now() at time zone 'America/Puerto_Rico')::date)
  from staff_activity a
  where staff_role() = 'admin'
    and (exists (select 1 from staff s where s.user_id = auth.uid() and s.is_owner)
         or a.user_id not in (select s.user_id from staff s where s.is_owner))
  group by a.user_id
$$;

-- The owner's row: only the owner changes or removes it, and only the owner gives or takes the owner mark
create or replace function protect_owner() returns trigger language plpgsql security definer set search_path = public as $$
declare caller_is_owner boolean := exists (select 1 from staff where user_id = auth.uid() and is_owner);
begin
  if auth.uid() is null or caller_is_owner then return coalesce(new, old); end if; -- database tools and the owner
  if tg_op = 'DELETE' and old.is_owner then raise exception 'Solo el dueño puede quitar esta cuenta del equipo.' using errcode = 'P0001'; end if;
  if tg_op = 'UPDATE' and (old.is_owner or new.is_owner <> old.is_owner) then raise exception 'Solo el dueño puede cambiar esta cuenta.' using errcode = 'P0001'; end if;
  if tg_op = 'INSERT' and new.is_owner then raise exception 'Solo el dueño puede marcar a alguien como dueño.' using errcode = 'P0001'; end if;
  return coalesce(new, old);
end $$;
drop trigger if exists staff_protect_owner on staff;
create trigger staff_protect_owner before insert or update or delete on staff for each row execute function protect_owner();

-- The panel asks "am I the owner?" (only about the signed-in person)
create or replace function soy_dueno() returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from staff where user_id = auth.uid() and is_owner)
$$;
grant execute on function soy_dueno() to authenticated;

-- ==================================================================
-- duenos.sql (from Noticias Xtra)
-- ==================================================================
-- NotiCel · owner accounts (run once in Supabase → SQL Editor; safe to run again; needs supabase/dueno.sql).
-- User, 2026-11-02:
--   1. Only administrators see owner accounts. Editors, Periodistas and Ventas don't see them in the team list (Tareas,
--      the panel) nor read their row in the team table; each person still sees their own row.
--   2. An owner makes another administrator an owner (or takes it away) from the panel: Equipo → "Hacer dueño".
--      The protect_owner trigger (dueno.sql) already lets only an owner give or take the mark.

-- 1. The team table: everyone on the team sees the team, except owner accounts, which only administrators see
drop policy if exists "staff see team" on staff;
create policy "staff see team" on staff for select using (staff_role() is not null and (not is_owner or staff_role() = 'admin' or user_id = auth.uid()));

-- …and the same in the team list the panel loads (with usernames and emails)
drop function if exists staff_list();
create function staff_list() returns table (user_id uuid, name text, role text, username text, email text)
language sql stable security definer set search_path = public as $$
  select s.user_id, s.name, s.role, p.username, u.email::text
  from staff s left join profiles p on p.id = s.user_id left join auth.users u on u.id = s.user_id
  where staff_role() is not null and (not s.is_owner or staff_role() = 'admin' or s.user_id = auth.uid())
  order by s.name;
$$;

-- ==================================================================
-- comisiones.sql (from Noticias Xtra)
-- ==================================================================
-- NotiCel · sales commissions (run once in Supabase → SQL Editor; safe to run again).
-- Panel → Ventas → "Mis comisiones" (each salesperson) and "Comisiones del equipo" (the administrator).
-- Rules (user, 2026-11-02): 20% on a new client, 10% on renewals and repeat orders, +5% on what is sold above the
-- monthly goal. Earned only when the client pays. The administrator can change each person's rates and goal here.

-- 1. Each salesperson's plan (no row = the default rates and no goal)
create table if not exists sales_plans (
  user_id uuid primary key references auth.users on delete cascade,
  new_pct numeric not null default 20,
  renew_pct numeric not null default 10,
  bonus_pct numeric not null default 5,
  goal numeric not null default 0, -- monthly goal in dollars (0 = none)
  updated_at timestamptz not null default now()
);
alter table sales_plans enable row level security;
drop policy if exists "read own plan" on sales_plans;
create policy "read own plan" on sales_plans for select using (user_id = auth.uid() and staff_role() is not null or staff_role() = 'admin');
drop policy if exists "admin sets plans" on sales_plans;
create policy "admin sets plans" on sales_plans for all using (staff_role() = 'admin') with check (staff_role() = 'admin');

-- 2. Commissions paid out: one row per person and month, written by the administrator
create table if not exists commission_payouts (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users on delete cascade,
  month text not null check (month ~ '^\d{4}-\d{2}$'), -- e.g. 2026-11
  amount numeric not null,
  note text not null default '',
  paid_by text not null default '',
  paid_at timestamptz not null default now(),
  unique (user_id, month)
);
alter table commission_payouts enable row level security;
drop policy if exists "read own payouts" on commission_payouts;
create policy "read own payouts" on commission_payouts for select using (user_id = auth.uid() and staff_role() is not null or staff_role() = 'admin');
drop policy if exists "admin pays" on commission_payouts;
create policy "admin pays" on commission_payouts for all using (staff_role() = 'admin') with check (staff_role() = 'admin');

-- ==================================================================
-- comisiones-dueno.sql (from Noticias Xtra)
-- ==================================================================
-- NotiCel · only the owner (publisher@noticel.com) changes commissions (run once in Supabase → SQL Editor;
-- safe to run again; needs supabase/comisiones.sql and supabase/dueno.sql first). User, 2026-11-02.
-- Each salesperson's percentages and goal (sales_plans) and the commission payments (commission_payouts): other
-- administrators can still see them, but only the owner can change them. Salespeople still see only their own.
drop policy if exists "admin sets plans" on sales_plans;
drop policy if exists "owner sets plans" on sales_plans;
create policy "owner sets plans" on sales_plans for all using (staff_role() = 'admin' and soy_dueno()) with check (staff_role() = 'admin' and soy_dueno());
drop policy if exists "admin pays" on commission_payouts;
drop policy if exists "owner pays" on commission_payouts;
create policy "owner pays" on commission_payouts for all using (staff_role() = 'admin' and soy_dueno()) with check (staff_role() = 'admin' and soy_dueno());

-- ==================================================================
-- gerente.sql (from Noticias Xtra)
-- ==================================================================
-- NotiCel · the "Gerente" (sales manager) role (run once in Supabase → SQL Editor; safe to run again).
-- User, 2026-11-02. A Gerente (role 'manager') does everything Ventas does (clients, direct sales, approve ads,
-- campaigns, payment links), sees the whole sales team (Comisiones del equipo, the company's Ingresos), and manages the
-- Ventas team (invites and removes salespeople only). Their own sales are the company's "Ventas directas", like the
-- administrator's: no commission. Commission rates and payouts stay with the owner (comisiones-dueno.sql).

-- 1. The new role
alter table staff drop constraint if exists staff_role_check;
alter table staff add constraint staff_role_check check (role in ('admin', 'editor', 'ads', 'reporter', 'manager', 'desk', 'photo'));

-- 2. Ad orders: read and update (approve, ask for changes, reject)
drop policy if exists "staff read requests" on ad_requests;
create policy "staff read requests" on ad_requests for select using (staff_role() in ('admin', 'editor', 'ads', 'manager'));
drop policy if exists "staff update requests" on ad_requests;
create policy "staff update requests" on ad_requests for update using (staff_role() in ('admin', 'editor', 'ads', 'manager'));

-- 3. Clients (Ventas → Clientes)
drop policy if exists "sales team" on sales_leads;
create policy "sales team" on sales_leads for all using (staff_role() in ('admin', 'ads', 'manager')) with check (staff_role() in ('admin', 'ads', 'manager'));

-- 4. Campaigns on the site and their images
drop policy if exists "ad staff publish" on ad_campaigns;
create policy "ad staff publish" on ad_campaigns for insert with check (staff_role() in ('admin', 'ads', 'manager'));
drop policy if exists "ad staff manage" on ad_campaigns;
create policy "ad staff manage" on ad_campaigns for update using (staff_role() in ('admin', 'ads', 'manager'));
drop policy if exists "ad staff upload images" on storage.objects;
create policy "ad staff upload images" on storage.objects for insert with check (bucket_id = 'anuncios' and staff_role() in ('admin', 'ads', 'manager'));
drop policy if exists "ad staff replace images" on storage.objects;
create policy "ad staff replace images" on storage.objects for update using (bucket_id = 'anuncios' and staff_role() in ('admin', 'ads', 'manager'));

-- 5. Commissions: the Gerente sees everyone's plan and payments (only the owner changes them)
drop policy if exists "read own plan" on sales_plans;
create policy "read own plan" on sales_plans for select using (user_id = auth.uid() and staff_role() is not null or staff_role() in ('admin', 'manager'));
drop policy if exists "read own payouts" on commission_payouts;
create policy "read own payouts" on commission_payouts for select using (user_id = auth.uid() and staff_role() is not null or staff_role() in ('admin', 'manager'));

-- 6. The Ventas team: a Gerente removes salespeople (only them); the administrator still manages everyone
drop policy if exists "manager removes salespeople" on staff;
create policy "manager removes salespeople" on staff for delete using (staff_role() = 'manager' and role = 'ads');

-- …and the administrator can give someone the Gerente role (Equipo → role menu)
create or replace function staff_add(handle text, display text, new_role text) returns text
language plpgsql security definer set search_path = public as $$
declare uid uuid;
begin
  if staff_role() is distinct from 'admin' then return 'Solo el administrador puede añadir personas.'; end if;
  if new_role not in ('admin', 'editor', 'ads', 'reporter', 'manager', 'desk', 'photo') then return 'Ese rol no existe.'; end if;
  select id into uid from profiles where username = lower(ltrim(handle, '@'));
  if uid is null then select id into uid from auth.users where lower(email) = lower(handle); end if;
  if uid is null then return 'No encontramos esa cuenta. Pídele que primero cree su cuenta en el sitio.'; end if;
  insert into staff (user_id, name, role) values (uid, coalesce(nullif(display, ''), handle), new_role)
  on conflict (user_id) do update set name = excluded.name, role = excluded.role;
  return 'ok';
end $$;

-- ==================================================================
-- editores.sql (from Noticias Xtra)
-- ==================================================================
-- NotiCel · Editor en jefe and Editor (run once in Supabase → SQL Editor; safe to run again). User, 2026-11-02.
-- The role 'editor' is now shown as "Editor en jefe" (nothing changes for it). The new role 'desk' ("Editor") edits,
-- approves and publishes every periodista's stories (no assigning: few editors, user 2026-11-02); the front page,
-- comments and analytics stay with the Editor en jefe.

-- 1. The new role
alter table staff drop constraint if exists staff_role_check;
alter table staff add constraint staff_role_check check (role in ('admin', 'editor', 'ads', 'reporter', 'manager', 'desk', 'photo'));

-- 2. Each periodista's editor
alter table staff add column if not exists editor_id uuid references auth.users on delete set null;

-- Does an Editor cover this person's stories? Every Editor covers every periodista (user, 2026-11-02: few editors,
-- no assigning); editor_id stays in the table, unused
create or replace function on_my_desk(member uuid) returns boolean language sql stable security definer set search_path = public as $$
  select staff_role() = 'desk' and exists (select 1 from staff where user_id = member)
$$;
grant execute on function on_my_desk(uuid) to authenticated;

-- 3. Stories: an Editor sees and edits their own and their periodistas'
drop policy if exists "staff read articles" on articles;
create policy "staff read articles" on articles for select
  using (owner = auth.uid() or staff_role() in ('admin', 'editor') or on_my_desk(owner));
drop policy if exists "staff create articles" on articles;
create policy "staff create articles" on articles for insert
  with check (staff_role() is not null and owner = auth.uid() and (status in ('draft', 'review') or staff_role() in ('admin', 'editor', 'desk')));
drop policy if exists "staff edit articles" on articles;
create policy "staff edit articles" on articles for update
  using (owner = auth.uid() or staff_role() in ('admin', 'editor') or on_my_desk(owner))
  with check (staff_role() in ('admin', 'editor') or on_my_desk(owner) or (owner = auth.uid() and (staff_role() = 'desk' or status in ('draft', 'review', 'scheduled'))));
drop policy if exists "staff delete articles" on articles;
create policy "staff delete articles" on articles for delete
  using (staff_role() in ('admin', 'editor') or ((owner = auth.uid() or on_my_desk(owner)) and status = 'draft'));

-- 4. The team list carries each periodista's editor (the return type changes, so drop it first)
drop function if exists staff_list();
create function staff_list() returns table (user_id uuid, name text, role text, username text, email text, editor_id uuid)
language sql stable security definer set search_path = public as $$
  select s.user_id, s.name, s.role, p.username, u.email::text, s.editor_id
  from staff s left join profiles p on p.id = s.user_id left join auth.users u on u.id = s.user_id
  where staff_role() is not null and (not s.is_owner or staff_role() = 'admin' or s.user_id = auth.uid())
  order by s.name;
$$;
grant execute on function staff_list() to authenticated;

-- 5. Assign a periodista to an editor (administrator or Editor en jefe); null = no editor
create or replace function staff_set_editor(member uuid, ed uuid) returns text
language plpgsql security definer set search_path = public as $$
begin
  if staff_role() not in ('admin', 'editor') then return 'Solo el administrador o el Editor en jefe asignan editores.'; end if;
  if not exists (select 1 from staff where user_id = member and role = 'reporter') then return 'Solo se le asigna editor a un periodista.'; end if;
  if ed is not null and not exists (select 1 from staff where user_id = ed and role in ('desk', 'editor')) then return 'Esa persona no es editor.'; end if;
  update staff set editor_id = ed where user_id = member;
  return 'ok';
end $$;
grant execute on function staff_set_editor(uuid, uuid) to authenticated;

-- 6. The administrator can give someone the Editor role (Equipo → role menu)
create or replace function staff_add(handle text, display text, new_role text) returns text
language plpgsql security definer set search_path = public as $$
declare uid uuid;
begin
  if staff_role() is distinct from 'admin' then return 'Solo el administrador puede añadir personas.'; end if;
  if new_role not in ('admin', 'editor', 'ads', 'reporter', 'manager', 'desk', 'photo') then return 'Ese rol no existe.'; end if;
  select id into uid from profiles where username = lower(ltrim(handle, '@'));
  if uid is null then select id into uid from auth.users where lower(email) = lower(handle); end if;
  if uid is null then return 'No encontramos esa cuenta. Pídele que primero cree su cuenta en el sitio.'; end if;
  insert into staff (user_id, name, role) values (uid, coalesce(nullif(display, ''), handle), new_role)
  on conflict (user_id) do update set name = excluded.name, role = excluded.role;
  return 'ok';
end $$;

-- 7. Photos: an Editor can fix the photos in the library, like the Editor en jefe
drop policy if exists "staff edit photos" on photos;
create policy "staff edit photos" on photos for update using (uploaded_by = auth.uid() or staff_role() in ('admin', 'editor', 'desk'));

-- 8. An Editor reads the ad orders too, to see which advertisers their periodistas referred (Mis periodistas) and get
--    Escribir's conflict-of-interest warning (user, 2026-11-02). Reading only: approving ads stays with Ventas.
drop policy if exists "staff read requests" on ad_requests;
create policy "staff read requests" on ad_requests for select using (staff_role() in ('admin', 'editor', 'ads', 'manager', 'desk'));

-- ==================================================================
-- memos-documentos.sql (from Noticias Xtra)
-- ==================================================================
-- NotiCel · Documentos (reglamentos and other files for the team) and Memos (user, 2026-11-04). Run once in
-- Supabase → SQL Editor (safe to run again).
--   Documentos: the administrator and the Gerente upload them (Personal); everyone on the team downloads them (Inicio).
--   The files live in a private storage folder ("personal"): only signed-in team members can download them.
--   Memos: the publisher (administrator) and the Editor en jefe write and publish them, to everyone, the newsroom or
--   sales; each person sees the ones for them in Memos and marks them read.

-- 1. Documentos
create table if not exists hr_docs (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(title) <= 120),
  category text not null default 'Reglamento' check (char_length(category) <= 40),
  path text not null,                         -- the file in the private "personal" folder
  file_name text not null default '',
  size integer not null default 0,
  uploaded_by text,
  created_at timestamptz not null default now()
);
alter table hr_docs enable row level security;
drop policy if exists "team reads documents" on hr_docs;
create policy "team reads documents" on hr_docs for select using (staff_role() is not null);
drop policy if exists "hr adds documents" on hr_docs;
create policy "hr adds documents" on hr_docs for insert with check (staff_role() in ('admin', 'manager'));
drop policy if exists "hr removes documents" on hr_docs;
create policy "hr removes documents" on hr_docs for delete using (staff_role() in ('admin', 'manager'));
grant select, insert, delete on hr_docs to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values ('personal', 'personal', false, 20971520, array['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'image/png', 'image/jpeg', 'text/plain'])
  on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;
drop policy if exists "team downloads documents" on storage.objects;
create policy "team downloads documents" on storage.objects for select using (bucket_id = 'personal' and staff_role() is not null);
drop policy if exists "hr uploads documents" on storage.objects;
create policy "hr uploads documents" on storage.objects for insert with check (bucket_id = 'personal' and staff_role() in ('admin', 'manager'));
drop policy if exists "hr deletes document files" on storage.objects;
create policy "hr deletes document files" on storage.objects for delete using (bucket_id = 'personal' and staff_role() in ('admin', 'manager'));

-- 2. Memos
create table if not exists memos (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(title) <= 140),
  body text not null check (char_length(body) <= 8000),
  audience text not null default 'todos' check (audience in ('todos', 'redaccion', 'ventas')),
  pinned boolean not null default false,
  author text not null,
  author_id uuid default auth.uid(),
  created_at timestamptz not null default now()
);
alter table memos enable row level security;
drop policy if exists "read memos" on memos;
create policy "read memos" on memos for select using (
  staff_role() in ('admin', 'editor', 'manager') or author_id = auth.uid()
  or (staff_role() is not null and (audience = 'todos'
    or (audience = 'redaccion' and staff_role() in ('desk', 'reporter'))
    or (audience = 'ventas' and staff_role() = 'ads'))));
drop policy if exists "write memos" on memos;
create policy "write memos" on memos for insert with check (staff_role() in ('admin', 'editor') and author_id = auth.uid());
drop policy if exists "change memos" on memos;
create policy "change memos" on memos for update using (staff_role() = 'admin' or author_id = auth.uid());
drop policy if exists "remove memos" on memos;
create policy "remove memos" on memos for delete using (staff_role() = 'admin' or author_id = auth.uid());
grant select, insert, update, delete on memos to authenticated;

create table if not exists memo_reads (
  memo_id uuid not null references memos on delete cascade,
  user_id uuid not null default auth.uid(),
  name text not null default '',
  read_at timestamptz not null default now(),
  primary key (memo_id, user_id)
);
alter table memo_reads enable row level security;
drop policy if exists "mark memo read" on memo_reads;
create policy "mark memo read" on memo_reads for insert with check (user_id = auth.uid() and staff_role() is not null);
drop policy if exists "see memo reads" on memo_reads;
create policy "see memo reads" on memo_reads for select using (user_id = auth.uid() or staff_role() in ('admin', 'editor', 'manager'));
grant select, insert on memo_reads to authenticated;

-- ==================================================================
-- permisos-equipo.sql (from Noticias Xtra)
-- ==================================================================
-- NotiCel · more for the Editor and the Gerente, and invoices (user, 2026-11-03). Run once in Supabase → SQL
-- Editor (safe to run again).
--   1. Comentarios (and the Foro's moderation): also the Editor ('desk') and the Gerente ('manager').
--   2. The Gerente reads the stories (Noticias, read only, and Mis periodistas) and Salud del sitio.
--   3. Facturas: invoices for ad sales, numbered automatically from 1001 (administrator and Gerente create them; Ventas
--      sees its own sales' invoices).
--   4. Personal (HR): records and days off.  5. Registro de actividad.

-- 1. Comments and the Foro
drop policy if exists "read comments" on comments;
create policy "read comments" on comments for select using (status = 'visible' or user_id = auth.uid() or staff_role() in ('admin', 'editor', 'desk', 'manager'));
drop policy if exists "newsroom decides" on comments;
create policy "newsroom decides" on comments for update using (staff_role() in ('admin', 'editor', 'desk', 'manager'));
drop policy if exists "delete own comments" on comments;
create policy "delete own comments" on comments for delete using (user_id = auth.uid() or staff_role() in ('admin', 'editor', 'desk', 'manager'));
drop policy if exists "read reports" on comment_reports;
create policy "read reports" on comment_reports for select using (user_id = auth.uid() or staff_role() in ('admin', 'editor', 'desk', 'manager'));
drop policy if exists "own profile update" on profiles;
create policy "own profile update" on profiles for update using (id = auth.uid() or staff_role() in ('admin', 'editor', 'desk', 'manager'));
drop policy if exists "read threads" on forum_threads;
create policy "read threads" on forum_threads for select using (status = 'visible' or user_id = auth.uid() or staff_role() in ('admin', 'editor', 'desk', 'manager'));
drop policy if exists "remove threads" on forum_threads;
create policy "remove threads" on forum_threads for delete using (user_id = auth.uid() or staff_role() in ('admin', 'editor', 'desk', 'manager'));
drop policy if exists "moderate threads" on forum_threads;
create policy "moderate threads" on forum_threads for update using (staff_role() in ('admin', 'editor', 'desk', 'manager'));
drop policy if exists "read replies" on forum_replies;
create policy "read replies" on forum_replies for select using (status = 'visible' or user_id = auth.uid() or staff_role() in ('admin', 'editor', 'desk', 'manager'));
drop policy if exists "remove replies" on forum_replies;
create policy "remove replies" on forum_replies for delete using (user_id = auth.uid() or staff_role() in ('admin', 'editor', 'desk', 'manager'));

-- 2. The Gerente: reads every story (never edits or publishes), the site's health and the panel's errors
drop policy if exists "staff read articles" on articles;
create policy "staff read articles" on articles for select
  using (owner = auth.uid() or staff_role() in ('admin', 'editor', 'manager') or on_my_desk(owner));
drop policy if exists "editors read errors" on panel_errors;
create policy "editors read errors" on panel_errors for select using (staff_role() in ('admin', 'editor', 'manager'));
create or replace function panel_stats() returns json
language plpgsql stable security definer set search_path = public, storage as $$
declare
  today timestamptz := date_trunc('day', now() at time zone 'America/Puerto_Rico') at time zone 'America/Puerto_Rico';
begin
  if coalesce(staff_role(), '') not in ('admin', 'editor', 'manager') then
    raise exception 'Solo editores, el Gerente y el administrador.' using errcode = 'P0001';
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

-- 3. Facturas
create sequence if not exists invoice_number start 1001;
create table if not exists invoices (
  number bigint primary key default nextval('invoice_number'),
  request_id text,                           -- the ad order (ad_requests.id) it bills
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid() references auth.users on delete set null,
  issued_by text,                            -- the team member's name, as shown on the invoice
  data jsonb not null,                       -- client, lines, total, due date, notes: a copy as issued
  void boolean not null default false        -- anulada (kept for the record, never deleted)
);
alter sequence invoice_number owned by invoices.number;
-- One live invoice per order; a voided one («Anulada») lets the order get a new invoice
create unique index if not exists invoices_one_live on invoices (request_id) where not void;
alter table invoices enable row level security;
drop policy if exists "billing reads" on invoices;
create policy "billing reads" on invoices for select using (staff_role() in ('admin', 'manager', 'ads')); -- Ventas: the panel shows each salesperson their own sales' invoices, read only
drop policy if exists "billing issues" on invoices;
create policy "billing issues" on invoices for insert with check (staff_role() in ('admin', 'manager'));
drop policy if exists "billing voids" on invoices;
create policy "billing voids" on invoices for update using (staff_role() in ('admin', 'manager'));
grant select, insert, update on invoices to authenticated;
grant usage on sequence invoice_number to authenticated;

-- 4. Personal (HR): each team member's record and days off (user, 2026-11-03). The administrator and the Gerente see and
--    edit everything; each person asks for days off and sees their own requests.
create table if not exists hr_people (
  user_id uuid primary key references auth.users on delete cascade,
  data jsonb not null default '{}',          -- puesto, tipo, fecha de inicio, teléfono, contacto de emergencia, notas
  updated_at timestamptz not null default now(),
  updated_by text
);
alter table hr_people enable row level security;
drop policy if exists "hr people" on hr_people;
create policy "hr people" on hr_people for all using (staff_role() in ('admin', 'manager')) with check (staff_role() in ('admin', 'manager'));
grant select, insert, update, delete on hr_people to authenticated;

create table if not exists hr_timeoff (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  name text not null,
  day_from date not null,
  day_to date not null,
  kind text not null default 'vacaciones' check (kind in ('vacaciones', 'enfermedad', 'personal', 'otro')),
  note text not null default '' check (char_length(note) <= 300),
  status text not null default 'pendiente' check (status in ('pendiente', 'aprobado', 'negado', 'cancelado')),
  decided_by text,
  decided_at timestamptz,
  created_at timestamptz not null default now(),
  check (day_to >= day_from)
);
alter table hr_timeoff enable row level security;
drop policy if exists "ask for days off" on hr_timeoff;
create policy "ask for days off" on hr_timeoff for insert with check (user_id = auth.uid() and staff_role() is not null and status = 'pendiente');
drop policy if exists "see days off" on hr_timeoff;
create policy "see days off" on hr_timeoff for select using (user_id = auth.uid() or staff_role() in ('admin', 'manager'));
drop policy if exists "decide days off" on hr_timeoff;
create policy "decide days off" on hr_timeoff for update using (staff_role() in ('admin', 'manager') or (user_id = auth.uid() and status = 'pendiente'))
  with check (staff_role() in ('admin', 'manager') or (user_id = auth.uid() and status in ('pendiente', 'cancelado')));
grant select, insert, update on hr_timeoff to authenticated;

-- 5. Registro de actividad: who did what and when in the panel (published, deleted, invited, changed a price…).
--    Every team member's panel writes its own actions; only the administrator reads the log. Nobody edits or deletes it.
create table if not exists activity_log (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  user_id uuid default auth.uid(),
  who text not null,
  action text not null check (char_length(action) <= 60),
  detail text not null default '' check (char_length(detail) <= 300)
);
alter table activity_log enable row level security;
drop policy if exists "staff log actions" on activity_log;
create policy "staff log actions" on activity_log for insert with check (staff_role() is not null and user_id = auth.uid());
drop policy if exists "admin reads the log" on activity_log;
create policy "admin reads the log" on activity_log for select using (staff_role() = 'admin');
grant select, insert on activity_log to authenticated;

-- ==================================================================
-- editar-memos-personal.sql (from Noticias Xtra)
-- ==================================================================
-- NotiCel · edit and delete memos, days off and documents (user, 2026-11-04). Run once in Supabase → SQL Editor
-- (safe to run again). Needs supabase/memos-documentos.sql and supabase/permisos-equipo.sql first.
--   Memos: the administrator, the Editor en jefe and the Gerente write, edit and delete any memo (an edited memo says
--   who changed it and when).
--   Días libres: the administrator and the Gerente change the dates, delete a request, or add days off for someone.
--   Documentos: the administrator and the Gerente rename a document or change its type.

-- 1. Memos
alter table memos add column if not exists edited_at timestamptz;
alter table memos add column if not exists edited_by text;
drop policy if exists "write memos" on memos;
create policy "write memos" on memos for insert with check (staff_role() in ('admin', 'editor', 'manager') and author_id = auth.uid());
drop policy if exists "change memos" on memos;
create policy "change memos" on memos for update using (staff_role() in ('admin', 'editor', 'manager') or author_id = auth.uid());
drop policy if exists "remove memos" on memos;
create policy "remove memos" on memos for delete using (staff_role() in ('admin', 'editor', 'manager') or author_id = auth.uid());
drop policy if exists "see memo reads" on memo_reads;
create policy "see memo reads" on memo_reads for select using (user_id = auth.uid() or staff_role() in ('admin', 'editor', 'manager'));

-- 2. Días libres
drop policy if exists "ask for days off" on hr_timeoff;
create policy "ask for days off" on hr_timeoff for insert with check (
  (user_id = auth.uid() and staff_role() is not null and status = 'pendiente')
  or staff_role() in ('admin', 'manager'));   -- the administrator and the Gerente add days off for anyone
drop policy if exists "remove days off" on hr_timeoff;
create policy "remove days off" on hr_timeoff for delete using (staff_role() in ('admin', 'manager'));
grant delete on hr_timeoff to authenticated;

-- 3. Documentos
drop policy if exists "hr edits documents" on hr_docs;
create policy "hr edits documents" on hr_docs for update using (staff_role() in ('admin', 'manager'));
grant update on hr_docs to authenticated;

-- ==================================================================
-- oculto.sql (from Noticias Xtra)
-- ==================================================================
-- NotiCel · hidden team members (user, 2026-11-14). Run once in Supabase → SQL Editor (safe to run again;
-- needs supabase/dueno.sql, duenos.sql and editores.sql, already run).
-- A member marked hidden is seen only by the owner (and by themselves): not in the team list, Equipo, Tareas, memos,
-- activity ("en el panel ahora", minutes) or the activity log. Only the owner marks or unmarks someone, and only the
-- owner can change or remove a hidden member. They still open the panel (Cloudflare's list comes from the
-- "equipo" function, which reads the whole team).

alter table staff add column if not exists hidden boolean not null default false;

-- 1. The team table: hidden rows only for the owner and the person themselves
drop policy if exists "staff see team" on staff;
create policy "staff see team" on staff for select using (
  staff_role() is not null
  and (not is_owner or staff_role() = 'admin' or user_id = auth.uid())
  and (not hidden or user_id = auth.uid() or soy_dueno())
);
drop policy if exists "admin manages team" on staff;
create policy "admin manages team" on staff for all
  using (staff_role() = 'admin' and (not hidden or soy_dueno()))
  with check (staff_role() = 'admin' and (not hidden or soy_dueno()));
drop policy if exists "manager removes salespeople" on staff;
create policy "manager removes salespeople" on staff for delete
  using (staff_role() = 'manager' and role in ('ads', 'reporter', 'desk', 'editor') and not hidden);

-- 2. The team list the panel loads
drop function if exists staff_list();
create function staff_list() returns table (user_id uuid, name text, role text, username text, email text, editor_id uuid)
language sql stable security definer set search_path = public as $$
  select s.user_id, s.name, s.role, p.username, u.email::text, s.editor_id
  from staff s left join profiles p on p.id = s.user_id left join auth.users u on u.id = s.user_id
  where staff_role() is not null
    and (not s.is_owner or staff_role() = 'admin' or s.user_id = auth.uid())
    and (not s.hidden or s.user_id = auth.uid() or soy_dueno())
  order by s.name;
$$;
grant execute on function staff_list() to authenticated;

-- 3. Activity (online now, minutes): owners' and hidden members' rows only for the owner
create or replace function staff_activity_list() returns table (user_id uuid, last_seen timestamptz, today_minutes integer, week_minutes integer, today_first timestamptz)
language sql stable security definer set search_path = public as $$
  select a.user_id, max(a.last_seen),
         coalesce(sum(a.minutes) filter (where a.day = (now() at time zone 'America/Puerto_Rico')::date), 0)::int,
         coalesce(sum(a.minutes) filter (where a.day > (now() at time zone 'America/Puerto_Rico')::date - 7), 0)::int,
         min(a.first_seen) filter (where a.day = (now() at time zone 'America/Puerto_Rico')::date)
  from staff_activity a
  where staff_role() = 'admin'
    and (soy_dueno() or a.user_id not in (select s.user_id from staff s where s.is_owner or s.hidden))
  group by a.user_id
$$;

-- 4. The activity log: a hidden member's actions only for the owner
drop policy if exists "admin reads the log" on activity_log;
create policy "admin reads the log" on activity_log for select using (
  staff_role() = 'admin' and (soy_dueno() or user_id is null or user_id not in (select s.user_id from staff s where s.hidden))
);

-- 5. Only the owner marks, changes or removes a hidden member (and the owner mark stays the owner's, as before)
create or replace function protect_owner() returns trigger language plpgsql security definer set search_path = public as $$
declare caller_is_owner boolean := exists (select 1 from staff where user_id = auth.uid() and is_owner);
begin
  if auth.uid() is null or caller_is_owner then return coalesce(new, old); end if; -- database tools and the owner
  if tg_op = 'DELETE' and (old.is_owner or old.hidden) then raise exception 'Solo el dueño puede quitar esta cuenta del equipo.' using errcode = 'P0001'; end if;
  if tg_op = 'UPDATE' and (old.is_owner or old.hidden or new.is_owner <> old.is_owner or new.hidden <> old.hidden) then raise exception 'Solo el dueño puede cambiar esta cuenta.' using errcode = 'P0001'; end if;
  if tg_op = 'INSERT' and (new.is_owner or new.hidden) then raise exception 'Solo el dueño puede hacer esto.' using errcode = 'P0001'; end if;
  return coalesce(new, old);
end $$;

-- 6. The owner hides or shows someone (Equipo → the person → Ocultar / Mostrar)
create or replace function staff_set_hidden(member uuid, h boolean) returns text
language plpgsql security definer set search_path = public as $$
begin
  if not soy_dueno() then return 'Solo el dueño puede ocultar a alguien.'; end if;
  if exists (select 1 from staff where user_id = member and is_owner) then return 'Esa cuenta es de un dueño.'; end if;
  update staff set hidden = h where user_id = member;
  return 'ok';
end $$;
grant execute on function staff_set_hidden(uuid, boolean) to authenticated;

-- ==================================================================
-- perfiles.sql (from Noticias Xtra)
-- ==================================================================
-- NotiCel · public profiles for reporters (run once in Supabase → SQL Editor; safe to run again).
-- Uses the same profiles table as the columnists (supabase/columnistas.sql). Each person on the team can create and
-- edit their own profile from the panel (Mi cuenta → Mi perfil público): picture, position, short bio and links.
-- Admins and editors still edit every profile in the Columnistas tab. The author page /autor/<name>/ shows the
-- profile and all of that person's stories, newest first.

alter table columnists add column if not exists kind text not null default 'columnista'; -- 'columnista' (Opinión) or 'periodista'
alter table columnists add column if not exists owner uuid references auth.users on delete set null; -- the team member who owns it

drop policy if exists "public reads active columnists" on columnists;
create policy "public reads active columnists" on columnists for select
  using (active or owner = auth.uid() or exists (select 1 from staff where user_id = auth.uid() and role in ('admin','editor')));
drop policy if exists "staff add own profile" on columnists;
create policy "staff add own profile" on columnists for insert
  with check (owner = auth.uid() and exists (select 1 from staff where user_id = auth.uid()));
drop policy if exists "staff edit own profile" on columnists;
create policy "staff edit own profile" on columnists for update
  using (owner = auth.uid() and exists (select 1 from staff where user_id = auth.uid()))
  with check (owner = auth.uid());

-- Pictures: anyone on the team can upload to the "columnistas" folder (their own picture)
drop policy if exists "staff upload profile photos" on storage.objects;
create policy "staff upload profile photos" on storage.objects for insert
  with check (bucket_id = 'columnistas' and exists (select 1 from staff where user_id = auth.uid()));
drop policy if exists "staff replace profile photos" on storage.objects;
create policy "staff replace profile photos" on storage.objects for update
  using (bucket_id = 'columnistas' and exists (select 1 from staff where user_id = auth.uid()));

-- ==================================================================
-- NotiCel's own pieces (kept after everything above)
-- ==================================================================
-- Roles: Noticias Xtra's six, plus Fotoperiodista (supabase/fotos-v2.sql)
alter table staff drop constraint if exists staff_role_check;
alter table staff add constraint staff_role_check check (role in ('admin', 'editor', 'ads', 'reporter', 'manager', 'desk', 'photo'));
alter table staff add column if not exists can_upload_photos boolean not null default false;
-- Who can add photos: administrators, both editors, photojournalists, and the periodistas the administrator allowed
create or replace function can_add_photos() returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from staff where user_id = auth.uid() and (role in ('admin', 'editor', 'desk', 'photo') or (role = 'reporter' and can_upload_photos)))
$$;
-- The team list: Noticias Xtra's (editor, owner and hidden rules) + "Puede subir fotos"
drop function if exists staff_list();
create function staff_list() returns table (user_id uuid, name text, role text, username text, email text, editor_id uuid, can_upload_photos boolean)
language sql stable security definer set search_path = public as $$
  select s.user_id, s.name, s.role, p.username, u.email::text, s.editor_id, s.can_upload_photos
  from staff s left join profiles p on p.id = s.user_id left join auth.users u on u.id = s.user_id
  where staff_role() is not null
    and (not s.is_owner or staff_role() = 'admin' or s.user_id = auth.uid())
    and (not s.hidden or s.user_id = auth.uid() or soy_dueno())
  order by s.name;
$$;
grant execute on function staff_list(), can_add_photos() to authenticated;
