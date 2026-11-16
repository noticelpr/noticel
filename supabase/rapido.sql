-- NotiCel · fast publishing (owner, 2026-11-16: "yes build option a"). Run once in Supabase → SQL Editor (safe to run again).
-- When an editor publishes in the panel, the "publicar" function saves the story file in GitHub (its permanent home)
-- AND a copy here. The site (functions/_lib/live.js) shows this copy within seconds: a brand-new story at its own
-- address, an edited one in place of the built page, and the newest ones on the home page, the sections and the
-- Última hora bar. The full rebuild of the site comes later in a batch; after it, the built pages take over again.

create table if not exists live_stories (
  path text primary key,                       -- the story's address, e.g. /noticias/20261116/titulo/
  slug text not null,                          -- its file name in GitHub (src/content/noticias/<slug>.md)
  file text not null,                          -- the whole story file (front matter + text), as saved in GitHub
  title text not null,
  section text,                                -- main category (the label over the headline)
  image text,
  breaking boolean not null default false,     -- Última hora
  publish_at timestamptz not null,             -- the story's date: scheduled stories stay hidden until then
  deleted boolean not null default false,      -- «Borrar para siempre»: the address answers "not found" at once
  updated_at timestamptz not null default now()
);
create index if not exists live_stories_updated on live_stories (updated_at desc);

alter table live_stories enable row level security;
-- Readers (the site) see stories whose time has come; only the "publicar" function (service role) writes
drop policy if exists "anyone reads published live stories" on live_stories;
create policy "anyone reads published live stories" on live_stories for select using (publish_at <= now());
grant select on live_stories to anon, authenticated;

-- Old rows are no longer needed after a few days (the built pages have them): cleaned every night
create extension if not exists pg_cron;
select cron.unschedule('limpiar-rapido') where exists (select 1 from cron.job where jobname = 'limpiar-rapido');
select cron.schedule('limpiar-rapido', '15 8 * * *', $$ delete from live_stories where updated_at < now() - interval '7 days' $$);

-- ===== Batch rebuild (run this part only on switch day, after deploying the "reconstruir" function and saving its
-- CF_DEPLOY_HOOK secret; until then the 2-hour copy from noticel.com, supabase/sincronizar.sql, rebuilds the site) =====
create table if not exists rebuilds (at timestamptz primary key default now());
alter table rebuilds enable row level security; -- only the "reconstruir" function (service role) uses it
-- select cron.unschedule('reconstruir') where exists (select 1 from cron.job where jobname = 'reconstruir');
-- select cron.schedule('reconstruir', '30 */2 * * *', $$
--   select net.http_post(url := 'https://tadrjmankkictvqzuibu.supabase.co/functions/v1/reconstruir',
--     headers := '{"Content-Type": "application/json"}'::jsonb, body := '{}'::jsonb);
-- $$);
