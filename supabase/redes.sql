-- Redes sociales (Escribir → Redes sociales; Edge Function "redes"): one row per story and network.
-- Run once in Supabase → SQL Editor. Safe to run again.
create table if not exists social_posts (
  id bigint generated always as identity primary key,
  article_id text not null,
  slug text not null,
  network text not null check (network in ('instagram', 'facebook')),
  status text not null default 'pending' check (status in ('pending', 'sent', 'error', 'skipped')),
  due_at timestamptz not null default now(),
  payload jsonb not null default '{}',
  result text not null default '',
  attempts int not null default 0,
  created_by text not null default '',
  created_at timestamptz not null default now(),
  sent_at timestamptz,
  unique (article_id, network) -- one post per story and network: a correction doesn't post again
);
alter table social_posts enable row level security;
drop policy if exists "staff read social posts" on social_posts;
create policy "staff read social posts" on social_posts for select using (staff_role() is not null);
-- Only the Edge Function (service key) adds and updates rows

-- Every 5 minutes, send the scheduled posts that are due (the function only sends what staff queued)
create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;
select cron.unschedule(jobid) from cron.job where jobname = 'redes-cada-5-min';
select cron.schedule('redes-cada-5-min', '*/5 * * * *', $$
  select net.http_post(
    url := 'https://NOTICEL-PROJECT.supabase.co/functions/v1/redes', -- NotiCel's own Supabase project address
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer NOTICEL-ANON-KEY"}'::jsonb,
    body := '{"action": "process"}'::jsonb
  )
$$);
