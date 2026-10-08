-- NotiCel: staff articles (panel → Escribir). Run once in Supabase → SQL Editor, after schema.sql.
-- Drafts are shared by the team here; a published story is saved in GitHub (src/content/noticias/) by the
-- "publicar" Edge Function (supabase/functions/publicar/index.ts), which keeps the site's full history.

-- The signed-in person's role ('admin', 'editor', 'ads', 'reporter'), or null if they're not on the team
create or replace function staff_role() returns text language sql stable security definer set search_path = public as $$
  select role from staff where user_id = auth.uid()
$$;

create table if not exists articles (
  id text primary key,
  owner uuid default auth.uid() references auth.users on delete set null, -- who started it
  status text not null default 'draft' check (status in ('draft', 'review', 'scheduled', 'published')),
  doc jsonb not null,            -- the whole article as the editor keeps it (title, body, photo, sources...)
  slug text unique,              -- file name in GitHub once published (stays the same on updates)
  published_by text,
  published_at timestamptz,
  updated_at timestamptz not null default now()
);

alter table articles enable row level security;
-- Reporters see and edit their own; editors and admins see and edit everyone's
create policy "staff read articles" on articles for select
  using (owner = auth.uid() or staff_role() in ('admin', 'editor'));
create policy "staff create articles" on articles for insert
  with check (staff_role() is not null and owner = auth.uid() and (status in ('draft', 'review') or staff_role() in ('admin', 'editor')));
-- Only editors and admins can mark a story published (the Edge Function does it after saving to GitHub).
-- Reporters can keep editing their own scheduled stories (the function schedules them)
create policy "staff edit articles" on articles for update
  using (owner = auth.uid() or staff_role() in ('admin', 'editor'))
  with check (staff_role() in ('admin', 'editor') or (owner = auth.uid() and status in ('draft', 'review', 'scheduled')));
create policy "staff delete articles" on articles for delete
  using (staff_role() in ('admin', 'editor') or (owner = auth.uid() and status = 'draft'));

-- Photos and PDFs added in the editor (public addresses, so the site can show them)
insert into storage.buckets (id, name, public) values ('noticias', 'noticias', true) on conflict do nothing;
create policy "staff upload story files" on storage.objects for insert
  with check (bucket_id = 'noticias' and staff_role() is not null);
create policy "staff replace story files" on storage.objects for update
  using (bucket_id = 'noticias' and staff_role() is not null);
