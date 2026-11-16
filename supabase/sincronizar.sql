-- NotiCel · start the copy from noticel.com every 2 hours (run in Supabase → SQL Editor AFTER deploying the
-- "sincronizar" function and saving its GITHUB_TOKEN secret; running it again just replaces the schedule).
-- Every 2 hours (user, 2026-11-16): each copy that finds new stories makes Cloudflare rebuild the test site, and the
-- free plan allows 500 builds a month; every 15 minutes used ~100 a day. The function starts the GitHub job when it's due.
-- Switch day (the newsroom moves to the new panel): turn it off with
--   select cron.unschedule('sincronizar');
create extension if not exists pg_cron;
create extension if not exists pg_net;
select cron.unschedule('sincronizar') where exists (select 1 from cron.job where jobname = 'sincronizar');
select cron.schedule('sincronizar', '0 */2 * * *', $$
  select net.http_post(
    url := 'https://tadrjmankkictvqzuibu.supabase.co/functions/v1/sincronizar',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRhZHJqbWFua2tpY3R2cXp1aWJ1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTE0ODU2MDEsImV4cCI6MjEwNzA2MTYwMX0.xzUXK192CWpDDU-OoWh8DEfxiL5vwXYvJ1AJ_JB6BzM"}'::jsonb,
    body := '{}'::jsonb
  );
$$);
