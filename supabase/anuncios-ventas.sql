-- NotiCel · ads and sales, like Noticias Xtra (2026-11-15). Run ONCE in Supabase → SQL Editor → New query → paste → Run
-- (safe to run again), after panel-equipo.sql. What it adds: NotiCel's own read counter (for "Lo más leído" and ad
-- estimates), fair share of ad views through the day, sending Anúnciate orders past ad blockers, the "Prefiero hablar
-- con alguien" form landing in Ventas, the advertiser panel (/publicidad/panel/), deleting ended test campaigns, the
-- first-time discount only once, the Gerente running sales, and periodistas' referral links.

-- ==================================================================
-- lecturas.sql (from Noticias Xtra)
-- ==================================================================
-- NotiCel · our own read counter (user, 2026-11-05). Run once in Supabase → SQL Editor (safe to run again).
-- Each story page counts one read per visit (after the reader stays a few seconds); the site asks every 15 minutes
-- what was read most in the last 24 hours, to place stories (Portada, sections, Tendencias). Only totals per story and
-- hour are kept: no reader, no device, no IP. Rows older than 30 days are deleted every night.

create table if not exists story_reads (
  slug text not null,
  hour timestamptz not null,
  n integer not null default 0,
  primary key (slug, hour)
);
alter table story_reads enable row level security; -- no policies: only the two functions below touch it

-- One read of one story (anyone may call it; the slug must look like a story's address)
create or replace function leer_noticia(s text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if s !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}-[a-z0-9-]{3,150}$' then return; end if;
  insert into story_reads (slug, hour, n) values (s, date_trunc('hour', now()), 1)
  on conflict (slug, hour) do update set n = story_reads.n + 1;
end $$;
grant execute on function leer_noticia(text) to anon, authenticated;

-- Reads per story in the last `horas` hours, most read first (public: these totals aren't private)
create or replace function noticias_leidas(horas integer default 24) returns table (slug text, n bigint)
language sql stable security definer set search_path = public as $$
  select slug, sum(n) as n from story_reads
  where hour >= now() - make_interval(hours => least(greatest(horas, 1), 720))
  group by slug order by 2 desc limit 300;
$$;
grant execute on function noticias_leidas(integer) to anon, authenticated;

-- Keep 30 days
create extension if not exists pg_cron;
select cron.unschedule('lecturas-limpieza') where exists (select 1 from cron.job where jobname = 'lecturas-limpieza');
select cron.schedule('lecturas-limpieza', '17 8 * * *', $$ delete from story_reads where hour < now() - interval '30 days' $$);

-- ==================================================================
-- vistas-justas.sql (from Noticias Xtra)
-- ==================================================================
-- NotiCel · fair share of ad views (user, 2026-11-06). Run once in Supabase → SQL Editor (safe to run again).
-- 1. Views per ad per day (Puerto Rico time), so the site gives each ad equal turns through the day.
-- 2. ad_inventario(): story reads in the last 30 days and the ads booked from today on, for the estimate on Anúnciate,
--    the "space full" notice, and the low-views warning in Ventas → Campañas. Only totals: nothing about readers.

create table if not exists ad_daily (
  campaign_id text not null references ad_campaigns on delete cascade,
  day date not null,
  views integer not null default 0,
  primary key (campaign_id, day)
);
alter table ad_daily enable row level security;
drop policy if exists "anyone reads daily ad views" on ad_daily;
create policy "anyone reads daily ad views" on ad_daily for select using (true); -- like ad_stats: counts, not private
grant select on ad_daily to anon, authenticated;

-- ad_view(): the same as before (supabase/anti-spam.sql), plus today's count
create or replace function ad_view(cid text) returns void language plpgsql security definer set search_path = public as $$
declare h json := current_setting('request.headers', true)::json; cnt int;
  who text := trim(split_part(coalesce(h ->> 'cf-connecting-ip', h ->> 'x-forwarded-for', ''), ',', 1));
begin
  if not exists (select 1 from ad_campaigns where id = cid and status = 'active') then return; end if;
  if who <> '' then
    insert into ad_view_seen (ip, campaign_id, hr) values (who, cid, date_trunc('hour', now()))
    on conflict (ip, campaign_id, hr) do update set n = ad_view_seen.n + 1 returning n into cnt;
    if random() < 0.01 then delete from ad_view_seen where hr < now() - interval '1 day'; end if;
    if cnt > 30 then return; end if; -- many readers can share one connection (phone carriers), so the limit is generous
  end if;
  insert into ad_stats (campaign_id, views) values (cid, 1)
  on conflict (campaign_id) do update set views = ad_stats.views + 1, updated_at = now();
  insert into ad_daily (campaign_id, day, views) values (cid, (now() at time zone 'America/Puerto_Rico')::date, 1)
  on conflict (campaign_id, day) do update set views = ad_daily.views + 1;
  update ad_campaigns set status = 'ended' where id = cid and views is not null and (select views from ad_stats where campaign_id = cid) >= views;
end $$;
grant execute on function ad_view(text) to anon, authenticated;

-- The ads running now, with today's views (today_views)
drop view if exists ad_campaigns_live;
create view ad_campaigns_live with (security_invoker = true) as
  select c.*, coalesce(s.views, 0) as delivered, coalesce(d.views, 0) as today_views
  from ad_campaigns c
  left join ad_stats s on s.campaign_id = c.id
  left join ad_daily d on d.campaign_id = c.id and d.day = (now() at time zone 'America/Puerto_Rico')::date
  where c.status = 'active' and current_date between c.start_date and c.end_date
    and (c.views is null or coalesce(s.views, 0) < c.views);
grant select on ad_campaigns_live to anon, authenticated;

-- Reads in the last 30 days + ads booked from today on (public: only totals and dates)
create or replace function ad_inventario() returns json language sql stable security definer set search_path = public as $$
  select json_build_object(
    'reads30', (select coalesce(sum(n), 0) from story_reads where hour >= now() - interval '30 days'),
    'busy', (select coalesce(json_agg(json_build_object('id', id, 'sizes', sizes, 'start_date', start_date, 'end_date', end_date, 'takeover', takeover)), '[]'::json)
             from ad_campaigns where status in ('active', 'paused') and end_date >= current_date)
  );
$$;
grant execute on function ad_inventario() to anon, authenticated;

-- Keep 400 days of daily counts
create extension if not exists pg_cron;
select cron.unschedule('ad-daily-limpieza') where exists (select 1 from cron.job where jobname = 'ad-daily-limpieza');
select cron.schedule('ad-daily-limpieza', '23 8 * * *', $$ delete from ad_daily where day < current_date - 400 $$);

-- ==================================================================
-- enviar-solicitud.sql (from Noticias Xtra)
-- ==================================================================
-- Anúnciate: requests are sent through enviar_solicitud() instead of the ad_requests address directly. Ad blockers on
-- phones (and some browsers) block any address that contains "ad_", which made sending fail with "Load failed".
-- It runs with the visitor's own permissions (security invoker), so the same rules and anti-spam checks still apply.
-- Run once in Supabase → SQL Editor (it is safe to run again).

create or replace function enviar_solicitud(r jsonb) returns void language sql security invoker set search_path = public as $$
  insert into ad_requests (id, status, paid, client, formats, placement, start, duration, total, lines, views, art, link)
  select id, status, paid, client, formats, placement, start, duration, total, lines, views, art, link
  from jsonb_populate_record(null::ad_requests, r);
$$;
grant execute on function enviar_solicitud(jsonb) to anon, authenticated;

-- ==================================================================
-- ventas-formulario.sql (from Noticias Xtra)
-- ==================================================================
-- "Prefiero hablar con alguien" (Anúnciate page): the visitor's message lands in the panel's Ventas as a new client.
-- Run once in Supabase → SQL Editor (it is safe to run again). Visitors can only ADD a new web request; they can never
-- read, change or delete the sales list (the "sales team" rule in connect-all.sql still covers everything else).

drop policy if exists "visitors send a contact request" on sales_leads;
create policy "visitors send a contact request" on sales_leads for insert to anon, authenticated
  with check (
    id like 'web-%'
    and data->>'stage' = 'new'
    and data->>'channel' = 'Formulario web'
    and length(data::text) < 6000
  );
grant insert on sales_leads to anon;

-- ==================================================================
-- anunciante-panel.sql (from Noticias Xtra)
-- ==================================================================
-- Advertiser panel (noticel.com/publicidad/panel/): a client who signs in with the same email they used on the
-- Anúnciate page sees their own requests. Campaign dates and view/click counts are already public (schema.sql).
-- Run once in Supabase → SQL Editor (it is safe to run again).

drop policy if exists "advertisers read their requests" on ad_requests;
create policy "advertisers read their requests" on ad_requests for select to authenticated
  using (lower(client->>'email') = lower(auth.jwt()->>'email'));
grant select on ad_requests to authenticated;

-- ==================================================================
-- borrar-campanas.sql (from Noticias Xtra)
-- ==================================================================
-- Panel → Ventas → Campañas → Terminadas: the admin can delete ended campaigns for good (e.g. tests). Their view and
-- click counts go with them (ad_stats is deleted along with the campaign). Running campaigns can't be deleted here:
-- end them first. Run once in Supabase → SQL Editor (it is safe to run again).

drop policy if exists "admin deletes ended campaigns" on ad_campaigns;
create policy "admin deletes ended campaigns" on ad_campaigns for delete
  using (status = 'ended' and exists (select 1 from staff where user_id = auth.uid() and role = 'admin'));
grant delete on ad_campaigns to authenticated;

-- ==================================================================
-- primera-vez.sql (from Noticias Xtra)
-- ==================================================================
-- NotiCel · the first-time discount (−40%) only once, and only for a signed-in client (run once in Supabase →
-- SQL Editor; safe to run again). User, 2026-11-02.
-- Anúnciate shows the option only to a signed-in client whose account never ordered, and the order carries a line
-- "Descuento: Primera vez (40%) …". Here the database refuses an order with that discount unless: the client is
-- signed in, the order uses their account's email, and that email has no earlier order (other than a rejected one).
-- The team (panel) is not limited: Ventas gives the discount in its own quotes.
create or replace function guard_first_time() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if staff_role() is not null then return new; end if;
  if exists (select 1 from unnest(new.lines) l where l ilike '%Primera vez%' or l ilike '%First time%') then
    if auth.uid() is null then
      raise exception 'Entra a tu cuenta para usar el descuento de primera vez.' using errcode = 'P0001';
    end if;
    if lower(coalesce(new.client ->> 'email', '')) <> lower(coalesce(auth.jwt() ->> 'email', '')) then
      raise exception 'El descuento de primera vez es para el correo de tu cuenta.' using errcode = 'P0001';
    end if;
    if exists (select 1 from ad_requests where lower(client ->> 'email') = lower(new.client ->> 'email') and status <> 'rechazada') then
      raise exception 'El descuento de primera vez ya se usó en esta cuenta.' using errcode = 'P0001';
    end if;
  end if;
  return new;
end $$;
drop trigger if exists ad_request_first_time on ad_requests;
create trigger ad_request_first_time before insert on ad_requests for each row execute function guard_first_time();

-- ==================================================================
-- vista-segura.sql (from Noticias Xtra)
-- ==================================================================
-- NotiCel · Supabase security warning "Security Definer View" on public.ad_campaigns_live (run once in
-- Supabase → SQL Editor; safe to run again). User, 2026-11-02.
-- The view of the ads running now used its creator's permissions; now it uses the permissions of whoever reads it.
-- Nothing changes for readers: ad_campaigns and ad_stats already let anyone read the ads and their counts.
alter view public.ad_campaigns_live set (security_invoker = true);

-- ==================================================================
-- gerente-todo.sql (from Noticias Xtra)
-- ==================================================================
-- NotiCel · the Gerente runs sales without the owner (run once in Supabase → SQL Editor; safe to run again).
-- User, 2026-11-02: "the Gerente should be able to do anything I can [in sales] so I don't get bothered". On top of
-- supabase/gerente.sql, a Gerente (role 'manager') now also: sets each person's commission and goal, marks commissions
-- paid, deletes finished ad orders, and deletes ended campaigns. The owner keeps all of it too.

-- 1. Commission and goal per person, and commission payments (was owner only: comisiones-dueno.sql)
drop policy if exists "owner sets plans" on sales_plans;
create policy "owner sets plans" on sales_plans for all
  using ((staff_role() = 'admin' and soy_dueno()) or staff_role() = 'manager')
  with check ((staff_role() = 'admin' and soy_dueno()) or staff_role() = 'manager');
drop policy if exists "owner pays" on commission_payouts;
create policy "owner pays" on commission_payouts for all
  using ((staff_role() = 'admin' and soy_dueno()) or staff_role() = 'manager')
  with check ((staff_role() = 'admin' and soy_dueno()) or staff_role() = 'manager');

-- 2. Anuncios → Terminadas: delete finished orders
drop policy if exists "admin deletes requests" on ad_requests;
create policy "admin deletes requests" on ad_requests for delete using (staff_role() in ('admin', 'manager'));

-- 3. Ventas → Campañas: delete ended campaigns for good (e.g. tests)
drop policy if exists "admin deletes ended campaigns" on ad_campaigns;
create policy "admin deletes ended campaigns" on ad_campaigns for delete
  using (status = 'ended' and staff_role() in ('admin', 'manager'));
grant delete on ad_campaigns to authenticated;

-- 4. Equipo: a Gerente also removes periodistas and editors (not administrators or other Gerentes). Inviting them and
--    changing their role goes through the "equipo" Edge Function, which has the same limit.
drop policy if exists "manager removes salespeople" on staff;
create policy "manager removes salespeople" on staff for delete using (staff_role() = 'manager' and role in ('ads', 'reporter', 'desk', 'editor'));

-- ==================================================================
-- referidos.sql (from Noticias Xtra)
-- ==================================================================
-- NotiCel · periodistas earn by referring advertisers (run once in Supabase → SQL Editor; safe to run again).
-- User, 2026-11-02. A periodista's own Anúnciate link (?v=<code>, the first 8 characters of their account id) marks
-- the orders it brings with "Referido: <code>". Here each periodista can read only those orders (to see their
-- referrals and earnings in Inicio → Mis referidos); everything else in ad_requests stays for Ventas and editors.
drop policy if exists "periodistas read their referrals" on ad_requests;
create policy "periodistas read their referrals" on ad_requests for select using (
  staff_role() = 'reporter' and ('Referido: ' || left(replace(auth.uid()::text, '-', ''), 8)) = any(lines)
);
