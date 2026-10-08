-- NotiCel · ads database (run once in Supabase → SQL editor). Used by src/lib/backend.ts.
-- Automatic publishing: staff approve an ad in the panel → a row in ad_campaigns → every reader's page shows it.
-- Paid views: each time an ad is at least half on screen, ad_view() adds one; when views reach the paid amount the
-- campaign drops out of ad_campaigns_live by itself.

create table if not exists staff (user_id uuid primary key references auth.users on delete cascade, name text, role text not null check (role in ('admin','editor','ads','reporter')));

create table if not exists ad_campaigns (
  id text primary key, client text not null, sizes text[] not null default '{}',
  start_date date not null default current_date, end_date date not null default '2099-12-31',
  regions text not null default 'all', takeover boolean not null default false, skin text,
  creatives jsonb not null default '[]', views integer, weight integer not null default 1,
  status text not null default 'active' check (status in ('active','paused','ended')),
  created_at timestamptz not null default now()
);
create table if not exists ad_stats (campaign_id text primary key references ad_campaigns on delete cascade, views integer not null default 0, clicks integer not null default 0, updated_at timestamptz default now());

-- Running now: active, inside its dates, and paid views not yet delivered
create or replace view ad_campaigns_live as
  select c.*, coalesce(s.views, 0) as delivered
  from ad_campaigns c left join ad_stats s on s.campaign_id = c.id
  where c.status = 'active' and current_date between c.start_date and c.end_date
    and (c.views is null or coalesce(s.views, 0) < c.views);

create or replace function ad_view(cid text) returns void language sql security definer as $$
  insert into ad_stats (campaign_id, views) values (cid, 1)
  on conflict (campaign_id) do update set views = ad_stats.views + 1, updated_at = now();
  update ad_campaigns set status = 'ended' where id = cid and views is not null and (select views from ad_stats where campaign_id = cid) >= views;
$$;
create or replace function ad_click(cid text) returns void language sql security definer as $$
  insert into ad_stats (campaign_id, clicks) values (cid, 1)
  on conflict (campaign_id) do update set clicks = ad_stats.clicks + 1, updated_at = now();
$$;

-- Who can do what: readers only read running ads and count views; staff (admin, ads) publish and manage
alter table staff enable row level security;
alter table ad_campaigns enable row level security;
alter table ad_stats enable row level security;
create policy "staff read themselves" on staff for select using (auth.uid() = user_id);
create policy "public reads campaigns" on ad_campaigns for select using (true);
create policy "ad staff publish" on ad_campaigns for insert with check (exists (select 1 from staff where user_id = auth.uid() and role in ('admin','ads')));
create policy "ad staff manage" on ad_campaigns for update using (exists (select 1 from staff where user_id = auth.uid() and role in ('admin','ads')));
create policy "public reads stats" on ad_stats for select using (true);
grant select on ad_campaigns_live to anon, authenticated;
grant execute on function ad_view(text), ad_click(text) to anon, authenticated;

-- Public bucket for ad images (uploads only by staff)
insert into storage.buckets (id, name, public) values ('anuncios', 'anuncios', true) on conflict do nothing;
create policy "ad staff upload images" on storage.objects for insert with check (bucket_id = 'anuncios' and exists (select 1 from staff where user_id = auth.uid() and role in ('admin','ads')));
create policy "ad staff replace images" on storage.objects for update using (bucket_id = 'anuncios' and exists (select 1 from staff where user_id = auth.uid() and role in ('admin','ads')));
