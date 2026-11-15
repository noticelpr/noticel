-- NotiCel · start the copy from noticel.com every 15 minutes (run in Supabase → SQL Editor AFTER deploying the
-- "sincronizar" function and saving its GITHUB_TOKEN secret; running it again just replaces the schedule).
-- The database calls the function every 5 minutes; the function starts the GitHub job when it's due.
-- Switch day (the newsroom moves to the new panel): turn it off with
--   select cron.unschedule('sincronizar');
create extension if not exists pg_cron;
create extension if not exists pg_net;
select cron.unschedule('sincronizar') where exists (select 1 from cron.job where jobname = 'sincronizar');
select cron.schedule('sincronizar', '*/5 * * * *', $$
  select net.http_post(
    url := 'https://tadrjmankkictvqzuibu.supabase.co/functions/v1/sincronizar',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRhZHJqbWFua2tpY3R2cXp1aWJ1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTE0ODU2MDEsImV4cCI6MjEwNzA2MTYwMX0.xzUXK192CWpDDU-OoWh8DEfxiL5vwXYvJ1AJ_JB6BzM"}'::jsonb,
    body := '{}'::jsonb
  );
$$);
