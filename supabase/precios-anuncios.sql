-- NotiCel · ad prices, ad sizes and placement (owner, 2026-11-16). Run ONCE in Supabase → SQL Editor → New query →
-- paste → Run (safe to run again), AFTER anuncios-ventas.sql.
--
-- 1. ad_prices: the prices of the self-serve square ad (Anúnciate), the design fee and the paid press release.
--    Prices live HERE, never in the website's code (the code is public). Anyone can read them (the Anúnciate page shows
--    them); only an administrator can change them (panel → Ajustes → Precios de anuncios). An empty price shows
--    "Precio por confirmar" on Anúnciate and the order can't be paid online until it's filled in.
--    The "pagos" Edge Function reads the price from this table when it opens Stripe (it never trusts the page).
-- 2. ad_campaigns: the ad's size (width × height, any size the client sold) and where it shows (placement: pages and,
--    for the wide banner, top or bottom).
-- 3. ad_campaign_deals: the price agreed with a direct client, per campaign. Private: only the administrator, the
--    Gerente and Ventas read or change it (ad_campaigns itself is public, so the price can't live there).

-- ================= 1. Self-serve prices =================
create table if not exists ad_prices (
  id text primary key,          -- e.g. cuadrado_mensual, cuadrado_7, diseno, comunicado_listo
  label text not null,          -- what the panel shows next to the box
  amount numeric check (amount is null or amount >= 0), -- US dollars; null = not set yet ("Precio por confirmar")
  sort integer not null default 0,
  updated_at timestamptz not null default now(),
  updated_by text
);
alter table ad_prices enable row level security;
drop policy if exists "anyone reads ad prices" on ad_prices;
create policy "anyone reads ad prices" on ad_prices for select using (true);
drop policy if exists "admin sets ad prices" on ad_prices;
create policy "admin sets ad prices" on ad_prices for all using (staff_role() = 'admin') with check (staff_role() = 'admin');
grant select on ad_prices to anon, authenticated;
grant insert, update on ad_prices to authenticated;

-- The rows the site uses (no amounts: the administrator types them in the panel). Existing amounts are kept.
insert into ad_prices (id, label, sort) values
  ('cuadrado_mensual', 'Cuadrado · cada mes (se renueva solo)', 1),
  ('cuadrado_7', 'Cuadrado · 1 semana', 2),
  ('cuadrado_30', 'Cuadrado · 1 mes', 3),
  ('cuadrado_90', 'Cuadrado · 3 meses', 4),
  ('cuadrado_180', 'Cuadrado · 6 meses', 5),
  ('diseno', 'Diseño del anuncio («Créenlo por mí»)', 6),
  ('comunicado_listo', 'Comunicado de prensa · escrito por el cliente', 7),
  ('comunicado_escrito', 'Comunicado de prensa · lo escribimos nosotros', 8)
on conflict (id) do update set label = excluded.label, sort = excluded.sort;

-- Who changed a price and when
create or replace function ad_prices_stamp() returns trigger language plpgsql security definer set search_path = public as $$
begin
  new.updated_at := now();
  new.updated_by := (select name from staff where user_id = auth.uid());
  return new;
end $$;
drop trigger if exists ad_prices_stamp on ad_prices;
create trigger ad_prices_stamp before insert or update on ad_prices for each row execute function ad_prices_stamp();

-- ================= 2. Size and placement of each campaign =================
alter table ad_campaigns add column if not exists width integer check (width is null or width between 10 and 4000);
alter table ad_campaigns add column if not exists height integer check (height is null or height between 10 and 4000);
-- placement: {"pages": ["portada", "notas", "secciones", "otras", "seccion:deportes", …], "banner": "top" | "bottom"}
-- Empty pages = every page. "seccion:<id>" = that section's page and its stories. No "banner" = top and bottom.
alter table ad_campaigns add column if not exists placement jsonb not null default '{}';

-- The view of the ads running now lists its columns when it's created, so it's made again to include the new ones
-- (same as anuncios-ventas.sql, vistas-justas part)
drop view if exists ad_campaigns_live;
create view ad_campaigns_live with (security_invoker = true) as
  select c.*, coalesce(s.views, 0) as delivered, coalesce(d.views, 0) as today_views
  from ad_campaigns c
  left join ad_stats s on s.campaign_id = c.id
  left join ad_daily d on d.campaign_id = c.id and d.day = (now() at time zone 'America/Puerto_Rico')::date
  where c.status = 'active' and current_date between c.start_date and c.end_date
    and (c.views is null or coalesce(s.views, 0) < c.views);
grant select on ad_campaigns_live to anon, authenticated;

-- Ventas, the Gerente and the administrator publish and change campaigns (same as panel-equipo.sql; repeated so this
-- file works on its own)
drop policy if exists "ad staff publish" on ad_campaigns;
create policy "ad staff publish" on ad_campaigns for insert with check (staff_role() in ('admin', 'ads', 'manager'));
drop policy if exists "ad staff manage" on ad_campaigns;
create policy "ad staff manage" on ad_campaigns for update using (staff_role() in ('admin', 'ads', 'manager'));

-- ================= 3. The agreed price of a direct campaign (private) =================
-- campaign_id has no link to ad_campaigns on purpose: a salesperson's sale waits for approval before its campaign
-- exists (its id is the order's id in lowercase).
create table if not exists ad_campaign_deals (
  campaign_id text primary key,
  price numeric check (price is null or price >= 0), -- the agreed price, before discounts
  total numeric check (total is null or total >= 0), -- what the client pays
  placement jsonb not null default '{}',             -- used when the campaign is created on approval (Anuncios)
  notes text,
  sold_by text,
  updated_at timestamptz not null default now()
);
alter table ad_campaign_deals enable row level security;
drop policy if exists "sales reads and sets deals" on ad_campaign_deals;
create policy "sales reads and sets deals" on ad_campaign_deals for all
  using (staff_role() in ('admin', 'manager', 'ads')) with check (staff_role() in ('admin', 'manager', 'ads'));
grant select, insert, update, delete on ad_campaign_deals to authenticated;
