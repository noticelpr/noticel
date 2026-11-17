-- NotiCel · traffic by spot (owner, 2026-11-17; same as the sister platform). Run once in Supabase → SQL Editor (safe to run again).
-- Every page counts, for each spot readers saw (the main story, the side spots, each section box, Tendencias, the ads…),
-- how many times it was on screen and how many times it was clicked, split by phone and computer (src/lib/traffic.ts).
-- Also the two-headline tests (which headline gets more clicks). Only totals per spot, day and hour are kept: no reader,
-- no device id, no IP. The panel's Analítica → Espacios reads them (administrator, editors, gerente). Rows older than
-- 90 days are deleted.

create table if not exists spot_stats (
  page text not null,      -- 'portada', 'seccion-deportes', 'noticia', 'autor'…
  spot text not null,      -- 'principal', 'lado-2', 'seccion-gobierno', 'tendencias-1', 'anuncio-rectangle-1'…
  device text not null,    -- 'm' phone, 'd' computer
  hour timestamptz not null,
  views integer not null default 0,
  clicks integer not null default 0,
  primary key (page, spot, device, hour)
);
alter table spot_stats enable row level security; -- no policies: only the functions below touch it

create table if not exists headline_stats (
  slug text not null,      -- the story's id (its file name, e.g. wpa-123456)
  variant text not null check (variant in ('A', 'B')),
  views integer not null default 0,
  clicks integer not null default 0,
  started timestamptz not null default now(),
  primary key (slug, variant)
);
alter table headline_stats enable row level security;

-- What one page saw: [{"p":"portada","s":"lado-2","d":"m","v":1,"c":0}, {"h":"<story id>","x":"B","v":1,"c":1}, …]
-- (anyone may call it; at most 80 rows, names checked, numbers capped)
create or replace function contar_trafico(items jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare it jsonb; v int; c int;
begin
  if jsonb_typeof(items) <> 'array' or jsonb_array_length(items) > 80 then return; end if;
  for it in select * from jsonb_array_elements(items) loop
    v := least(greatest(coalesce((it->>'v')::int, 0), 0), 3);
    c := least(greatest(coalesce((it->>'c')::int, 0), 0), 3);
    if v = 0 and c = 0 then continue; end if;
    if it ? 'h' then
      if (it->>'h') !~ '^[a-z0-9][a-z0-9-]{1,150}$' or (it->>'x') not in ('A', 'B') then continue; end if;
      insert into headline_stats (slug, variant, views, clicks) values (it->>'h', it->>'x', v, c)
      on conflict (slug, variant) do update set views = headline_stats.views + v, clicks = headline_stats.clicks + c;
    else
      if (it->>'p') !~ '^[a-z0-9-]{1,60}$' or (it->>'s') !~ '^[a-z0-9-]{1,60}$' or (it->>'d') not in ('m', 'd') then continue; end if;
      insert into spot_stats (page, spot, device, hour, views, clicks) values (it->>'p', it->>'s', it->>'d', date_trunc('hour', now()), v, c)
      on conflict (page, spot, device, hour) do update set views = spot_stats.views + v, clicks = spot_stats.clicks + c;
    end if;
  end loop;
end $$;
grant execute on function contar_trafico(jsonb) to anon, authenticated;

-- For the panel (administrator, editors, gerente): totals per page, spot and device in the last `dias` days
create or replace function trafico_espacios(dias integer default 7) returns table (page text, spot text, device text, views bigint, clicks bigint)
language sql stable security definer set search_path = public as $$
  select page, spot, device, sum(views), sum(clicks) from spot_stats
  where staff_role() in ('admin', 'editor', 'manager') and hour >= now() - make_interval(days => least(greatest(dias, 1), 90))
  group by page, spot, device order by 4 desc limit 2000;
$$;
grant execute on function trafico_espacios(integer) to authenticated;

-- Page visits by weekday and hour, Puerto Rico time. Every page's header is on screen when it opens, so its views
-- ('cabecera') count the visits.
create or replace function trafico_horas(dias integer default 28) returns table (dow integer, hr integer, n bigint)
language sql stable security definer set search_path = public as $$
  select extract(dow from hour at time zone 'America/Puerto_Rico')::int, extract(hour from hour at time zone 'America/Puerto_Rico')::int, sum(views)
  from spot_stats
  where staff_role() in ('admin', 'editor', 'manager') and spot = 'cabecera' and hour >= now() - make_interval(days => least(greatest(dias, 1), 90))
  group by 1, 2;
$$;
grant execute on function trafico_horas(integer) to authenticated;

-- The two-headline tests (public: only totals; scripts/titulares.mjs reads them to pick each winner)
create or replace function titulares_resultados() returns table (slug text, variant text, views integer, clicks integer)
language sql stable security definer set search_path = public as $$
  select slug, variant, views, clicks from headline_stats order by started desc, slug, variant limit 4000;
$$;
grant execute on function titulares_resultados() to anon, authenticated;

-- Keep 90 days of spots; headline tests for 30 days
create extension if not exists pg_cron;
select cron.unschedule('trafico-limpieza') where exists (select 1 from cron.job where jobname = 'trafico-limpieza');
select cron.schedule('trafico-limpieza', '23 8 * * *', $$
  delete from spot_stats where hour < now() - interval '90 days';
  delete from headline_stats where started < now() - interval '30 days';
$$);
