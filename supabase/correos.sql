-- NotiCel · automatic emails to advertisers, every 10 minutes. RUN ONLY AFTER the "correos" function is deployed and
-- RESEND_API_KEY / MAIL_FROM / TEAM_EMAIL are saved as Supabase secrets (needs noticel.com verified in Resend).
-- NotiCel · automatic emails to advertisers (run once in Supabase → SQL editor, after deploying the
-- "correos" Edge Function). See supabase/functions/correos/index.ts.

-- 1. What was already sent, so no email ever goes out twice. Only the Edge Function (service role) uses it.
create table if not exists email_log (
  key text primary key,          -- e.g. "R-ABC123:aprobada"
  to_email text,
  subject text,
  sent_at timestamptz not null default now()
);
alter table email_log enable row level security;

-- 2. Orders, campaigns and contact requests from before today count as already emailed (they were tests),
--    so the first run doesn't email old clients.
insert into email_log (key, subject)
  select r.id || ':' || k, 'anterior a los correos automáticos'
  from ad_requests r, unnest(array['equipo', 'recibida', 'aprobada', 'rechazada', 'aire', 'pronto', 'fin', 'cambios:' || length(coalesce(r.note, ''))]) k
on conflict do nothing;
insert into email_log (key, subject)
  select l.id || ':lead', 'anterior a los correos automáticos' from sales_leads l
on conflict do nothing;

-- 3. Run the emails every 10 minutes (uses the public anon key, like the site does; the function decides what's due).
create extension if not exists pg_cron;
create extension if not exists pg_net;
select cron.unschedule('correos') where exists (select 1 from cron.job where jobname = 'correos');
select cron.schedule('correos', '*/10 * * * *', $$
  select net.http_post(
    url := 'https://tadrjmankkictvqzuibu.supabase.co/functions/v1/correos',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRhZHJqbWFua2tpY3R2cXp1aWJ1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTE0ODU2MDEsImV4cCI6MjEwNzA2MTYwMX0.xzUXK192CWpDDU-OoWh8DEfxiL5vwXYvJ1AJ_JB6BzM"}'::jsonb,
    body := '{}'::jsonb
  );
$$);
