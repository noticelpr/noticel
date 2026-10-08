-- NotiCel: full database setup in one go (run once in Supabase → SQL Editor → New query → paste → Run).
-- It is the files of this folder, in the right order. Safe to run again. Social posts (redes.sql) come later.

-- ==================================================================
-- schema.sql
-- ==================================================================
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

-- ==================================================================
-- articles.sql
-- ==================================================================
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

-- ==================================================================
-- comments.sql
-- ==================================================================
-- NotiCel: reader accounts, comments, likes, reports and notifications.
-- Run once in Supabase → SQL Editor, after schema.sql and articles.sql. Safe to run again.
-- Moderation (chosen by the publisher): comments go live right away; the site blocks clear violations before
-- posting and sends doubtful ones to review; 3 reports from different readers hide a comment until the newsroom decides.

-- ---------- Profiles: one per account, with a public username ----------
create table if not exists profiles (
  id uuid primary key references auth.users on delete cascade,
  username text unique not null check (username ~ '^[a-z0-9._]{3,20}$'),
  photo text,
  banned boolean not null default false,
  created_at timestamptz not null default now()
);
alter table profiles enable row level security;
drop policy if exists "anyone reads profiles" on profiles;
create policy "anyone reads profiles" on profiles for select using (true);
drop policy if exists "own profile" on profiles;
create policy "own profile" on profiles for insert with check (id = auth.uid());
drop policy if exists "own profile update" on profiles;
create policy "own profile update" on profiles for update using (id = auth.uid() or staff_role() in ('admin', 'editor'));
-- Readers can change their username and photo, never their own "banned" mark
revoke update on profiles from authenticated;
grant update (username, photo) on profiles to authenticated;

-- A free username from a wish ("Ana María" → "anamaria", "anamaria2"…)
create or replace function free_username(wish text) returns text language plpgsql security definer set search_path = public as $$
declare base text; candidate text; n int := 1;
begin
  base := left(regexp_replace(lower(translate(coalesce(wish, ''), 'áéíóúüñÁÉÍÓÚÜÑ', 'aeiouunaeiouun')), '[^a-z0-9._]', '', 'g'), 16);
  if length(base) < 3 then base := 'lector' || base; end if;
  candidate := base;
  while exists (select 1 from profiles where username = candidate) loop
    n := n + 1; candidate := base || n;
  end loop;
  return candidate;
end $$;

-- Every new account (email or Google) gets its profile right away
create or replace function handle_new_user() returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into profiles (id, username, photo)
  values (new.id,
    free_username(coalesce(new.raw_user_meta_data->>'username', new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1))),
    new.raw_user_meta_data->>'avatar_url')
  on conflict (id) do nothing;
  return new;
end $$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users for each row execute function handle_new_user();
-- Accounts that already exist (the staff) get a profile too
insert into profiles (id, username) select id, free_username(split_part(email, '@', 1)) from auth.users on conflict (id) do nothing;

-- ---------- Comments ----------
create table if not exists comments (
  id uuid primary key default gen_random_uuid(),
  story text not null,                       -- story or game id
  url text not null default '',              -- page address, for notifications
  user_id uuid not null default auth.uid() references profiles on delete cascade,
  parent uuid references comments on delete cascade,
  body text not null default '' check (char_length(body) <= 500),
  media jsonb,                               -- sticker or GIF: { kind, src }
  status text not null default 'visible' check (status in ('visible', 'review', 'removed')),
  flags text[] not null default '{}',        -- why the automatic check sent it to review
  likes int not null default 0,
  reports int not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists comments_story on comments (story, created_at);
alter table comments enable row level security;
drop policy if exists "read comments" on comments;
create policy "read comments" on comments for select
  using (status = 'visible' or user_id = auth.uid() or staff_role() in ('admin', 'editor'));
drop policy if exists "post comments" on comments;
create policy "post comments" on comments for insert
  with check (user_id = auth.uid() and status in ('visible', 'review') and likes = 0 and reports = 0
    and not exists (select 1 from profiles where id = auth.uid() and banned));
drop policy if exists "newsroom decides" on comments;
create policy "newsroom decides" on comments for update using (staff_role() in ('admin', 'editor'));
drop policy if exists "delete own comments" on comments;
create policy "delete own comments" on comments for delete using (user_id = auth.uid() or staff_role() in ('admin', 'editor'));

-- ---------- Likes ----------
create table if not exists comment_likes (
  comment uuid references comments on delete cascade,
  user_id uuid not null default auth.uid() references profiles on delete cascade,
  primary key (comment, user_id)
);
alter table comment_likes enable row level security;
drop policy if exists "read likes" on comment_likes;
create policy "read likes" on comment_likes for select using (true);
drop policy if exists "like" on comment_likes;
create policy "like" on comment_likes for insert with check (user_id = auth.uid());
drop policy if exists "unlike" on comment_likes;
create policy "unlike" on comment_likes for delete using (user_id = auth.uid());

-- ---------- Reports: 3 different readers hide a comment until the newsroom decides ----------
create table if not exists comment_reports (
  comment uuid references comments on delete cascade,
  user_id uuid not null default auth.uid() references profiles on delete cascade,
  reason text not null,
  created_at timestamptz not null default now(),
  primary key (comment, user_id)
);
alter table comment_reports enable row level security;
drop policy if exists "report" on comment_reports;
create policy "report" on comment_reports for insert with check (user_id = auth.uid());
drop policy if exists "read reports" on comment_reports;
create policy "read reports" on comment_reports for select using (user_id = auth.uid() or staff_role() in ('admin', 'editor'));

-- ---------- Notifications ----------
create table if not exists notifications (
  id bigint generated always as identity primary key,
  user_id uuid not null references profiles on delete cascade,
  kind text not null check (kind in ('mention', 'reply', 'like', 'badge', 'mod')),
  actor text,
  text text not null,
  quote text,
  url text,
  read boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists notifications_user on notifications (user_id, created_at desc);
alter table notifications enable row level security;
drop policy if exists "own notifications" on notifications;
create policy "own notifications" on notifications for select using (user_id = auth.uid());
drop policy if exists "mark read" on notifications;
create policy "mark read" on notifications for update using (user_id = auth.uid());
drop policy if exists "clear notifications" on notifications;
create policy "clear notifications" on notifications for delete using (user_id = auth.uid());

-- ---------- Automatic counts and notifications ----------
create or replace function on_comment() returns trigger language plpgsql security definer set search_path = public as $$
declare me text; to_user uuid; m text; told uuid[] := array[new.user_id];
begin
  select username into me from profiles where id = new.user_id;
  -- Reply → the author of the comment being answered
  if new.parent is not null then
    select user_id into to_user from comments where id = new.parent;
    if to_user is not null and not to_user = any(told) then
      insert into notifications (user_id, kind, actor, text, quote, url) values (to_user, 'reply', me, 'respondió a tu comentario.', left(new.body, 80), new.url);
      told := told || to_user;
    end if;
  end if;
  -- @mentions → each person named
  for m in select distinct lower(x[1]) from regexp_matches(new.body, '@([A-Za-z0-9._]{3,20})', 'g') as x loop
    select id into to_user from profiles where username = m;
    if to_user is not null and not to_user = any(told) then
      insert into notifications (user_id, kind, actor, text, quote, url) values (to_user, 'mention', me, 'te mencionó en un comentario.', left(new.body, 80), new.url);
      told := told || to_user;
    end if;
  end loop;
  return new;
end $$;
drop trigger if exists comment_posted on comments;
create trigger comment_posted after insert on comments for each row when (new.status = 'visible') execute function on_comment();

create or replace function on_like() returns trigger language plpgsql security definer set search_path = public as $$
declare c comments; me text;
begin
  if tg_op = 'INSERT' then
    update comments set likes = likes + 1 where id = new.comment returning * into c;
    if c.user_id <> new.user_id then
      select username into me from profiles where id = new.user_id;
      insert into notifications (user_id, kind, actor, text, quote, url) values (c.user_id, 'like', me, 'le gustó tu comentario.', left(c.body, 80), c.url);
    end if;
    return new;
  end if;
  update comments set likes = greatest(0, likes - 1) where id = old.comment;
  return old;
end $$;
drop trigger if exists like_changed on comment_likes;
create trigger like_changed after insert or delete on comment_likes for each row execute function on_like();

create or replace function on_report() returns trigger language plpgsql security definer set search_path = public as $$
begin
  update comments set reports = reports + 1,
    status = case when reports + 1 >= 3 and status = 'visible' then 'review' else status end
  where id = new.comment;
  return new;
end $$;
drop trigger if exists comment_reported on comment_reports;
create trigger comment_reported after insert on comment_reports for each row execute function on_report();

-- The newsroom removed a comment → its author is told
create or replace function on_decision() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'removed' and old.status <> 'removed' then
    insert into notifications (user_id, kind, text, quote, url) values (new.user_id, 'mod', 'La redacción quitó tu comentario por incumplir las reglas de la comunidad.', left(new.body, 80), new.url);
  end if;
  return new;
end $$;
drop trigger if exists comment_decided on comments;
create trigger comment_decided after update of status on comments for each row execute function on_decision();

-- ---------- Profile photos ----------
insert into storage.buckets (id, name, public) values ('avatars', 'avatars', true) on conflict do nothing;
drop policy if exists "own avatar upload" on storage.objects;
create policy "own avatar upload" on storage.objects for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

-- ==================================================================
-- comment-photos.sql
-- ==================================================================
-- NotiCel: photos in comments (shown small, like Instagram). Run once in Supabase → SQL Editor. Safe to run again.
-- Each reader uploads only into their own folder (comentarios/<their id>/...); anyone can view them.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('comentarios', 'comentarios', true, 3145728, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set public = true, file_size_limit = 3145728, allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp'];
drop policy if exists "own comment photo upload" on storage.objects;
create policy "own comment photo upload" on storage.objects for insert to authenticated
  with check (bucket_id = 'comentarios' and (storage.foldername(name))[1] = auth.uid()::text);

-- ==================================================================
-- connect-all.sql
-- ==================================================================
-- NotiCel: everything that used to stay on one device, now shared through Supabase.
-- Run once in Supabase → SQL Editor, after schema.sql, articles.sql, comments.sql and comment-photos.sql. Safe to run again.
-- 1 Ad requests · 2 Sales clients · 3 Team and tasks · 4 Reputation · 5 Foro · 6 Saved stories · 7 Game points · 8 Notification settings

-- ================= 1. Ad requests (Anúnciate → the Anuncios queue) =================
create table if not exists ad_requests (
  id text primary key,
  created_at timestamptz not null default now(),
  status text not null default 'revisar' check (status in ('revisar', 'disenar', 'cambios', 'aprobada', 'rechazada')),
  paid boolean not null default false,
  client jsonb not null,           -- name, business, email, phone, who
  formats text[] not null default '{}',
  placement text,                  -- "where" the ad shows
  start text, duration text,
  total numeric not null default 0,
  lines text[] not null default '{}',
  views int,
  art jsonb not null default '{}', -- uploaded images are addresses in the "solicitudes" bucket
  link text, note text
);
alter table ad_requests enable row level security;
drop policy if exists "anyone sends a request" on ad_requests;
create policy "anyone sends a request" on ad_requests for insert with check (status in ('revisar', 'disenar') and paid = false);
drop policy if exists "staff read requests" on ad_requests;
create policy "staff read requests" on ad_requests for select using (staff_role() in ('admin', 'editor', 'ads'));
drop policy if exists "staff update requests" on ad_requests;
create policy "staff update requests" on ad_requests for update using (staff_role() in ('admin', 'editor', 'ads'));
drop policy if exists "admin deletes requests" on ad_requests;
create policy "admin deletes requests" on ad_requests for delete using (staff_role() = 'admin');
-- After paying online the client's page marks the request paid (the team still checks the payment in Stripe / ATH)
create or replace function mark_request_paid(rid text) returns void language sql security definer set search_path = public as $$
  update ad_requests set paid = true where id = rid and paid = false;
$$;
-- Ad images sent with a request
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('solicitudes', 'solicitudes', true, 5242880, array['image/png', 'image/jpeg', 'image/webp', 'image/gif'])
on conflict (id) do update set public = true, file_size_limit = 5242880, allowed_mime_types = array['image/png', 'image/jpeg', 'image/webp', 'image/gif'];
drop policy if exists "anyone uploads request images" on storage.objects;
create policy "anyone uploads request images" on storage.objects for insert with check (bucket_id = 'solicitudes');

-- ================= 2. Sales clients and proposals (Ventas) =================
create table if not exists sales_leads (
  id text primary key,
  data jsonb not null,             -- the whole client record as the sales desk keeps it
  updated_at timestamptz not null default now()
);
alter table sales_leads enable row level security;
drop policy if exists "sales team" on sales_leads;
create policy "sales team" on sales_leads for all using (staff_role() in ('admin', 'ads')) with check (staff_role() in ('admin', 'ads'));

-- ================= 3. Team and tasks =================
create table if not exists staff_tasks (
  id text primary key,
  data jsonb not null,
  updated_at timestamptz not null default now()
);
alter table staff_tasks enable row level security;
drop policy if exists "staff tasks" on staff_tasks;
create policy "staff tasks" on staff_tasks for all using (staff_role() is not null) with check (staff_role() is not null);
-- Everyone on the team can see the team; only the admin changes it
drop policy if exists "staff see team" on staff;
create policy "staff see team" on staff for select using (staff_role() is not null);
drop policy if exists "admin manages team" on staff;
create policy "admin manages team" on staff for all using (staff_role() = 'admin') with check (staff_role() = 'admin');
-- The team with each person's username and email (staff only)
create or replace function staff_list() returns table (user_id uuid, name text, role text, username text, email text)
language sql stable security definer set search_path = public as $$
  select s.user_id, s.name, s.role, p.username, u.email::text
  from staff s left join profiles p on p.id = s.user_id left join auth.users u on u.id = s.user_id
  where staff_role() is not null order by s.name;
$$;
-- The admin adds someone who already has an account (they sign up on the site first), by @username or email
create or replace function staff_add(handle text, display text, new_role text) returns text
language plpgsql security definer set search_path = public as $$
declare uid uuid;
begin
  if staff_role() is distinct from 'admin' then return 'Solo el administrador puede añadir personas.'; end if;
  if new_role not in ('admin', 'editor', 'ads', 'reporter') then return 'Ese rol no existe.'; end if;
  select id into uid from profiles where username = lower(ltrim(handle, '@'));
  if uid is null then select id into uid from auth.users where lower(email) = lower(handle); end if;
  if uid is null then return 'No encontramos esa cuenta. Pídele que primero cree su cuenta en el sitio.'; end if;
  insert into staff (user_id, name, role) values (uid, coalesce(nullif(display, ''), handle), new_role)
  on conflict (user_id) do update set name = excluded.name, role = excluded.role;
  return 'ok';
end $$;

-- ================= 8. Notification settings (before 4, so the triggers below can use them) =================
alter table profiles add column if not exists notif_prefs jsonb not null default '{}';
grant update (username, photo, notif_prefs) on profiles to authenticated;
-- Does this reader want this kind of notification? (on unless they turned it off)
create or replace function wants(uid uuid, kind text) returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select (notif_prefs ->> kind)::boolean from profiles where id = uid), true);
$$;
create or replace function on_comment() returns trigger language plpgsql security definer set search_path = public as $$
declare me text; to_user uuid; m text; told uuid[] := array[new.user_id];
begin
  select username into me from profiles where id = new.user_id;
  if new.parent is not null then
    select user_id into to_user from comments where id = new.parent;
    if to_user is not null and not to_user = any(told) then
      if wants(to_user, 'reply') then
        insert into notifications (user_id, kind, actor, text, quote, url) values (to_user, 'reply', me, 'respondió a tu comentario.', left(new.body, 80), new.url);
      end if;
      told := told || to_user;
    end if;
  end if;
  for m in select distinct lower(x[1]) from regexp_matches(new.body, '@([A-Za-z0-9._]{3,20})', 'g') as x loop
    select id into to_user from profiles where username = m;
    if to_user is not null and not to_user = any(told) then
      if wants(to_user, 'mention') then
        insert into notifications (user_id, kind, actor, text, quote, url) values (to_user, 'mention', me, 'te mencionó en un comentario.', left(new.body, 80), new.url);
      end if;
      told := told || to_user;
    end if;
  end loop;
  return new;
end $$;
create or replace function on_like() returns trigger language plpgsql security definer set search_path = public as $$
declare c comments; me text;
begin
  if tg_op = 'INSERT' then
    update comments set likes = likes + 1 where id = new.comment returning * into c;
    if c.user_id <> new.user_id and wants(c.user_id, 'like') then
      select username into me from profiles where id = new.user_id;
      insert into notifications (user_id, kind, actor, text, quote, url) values (c.user_id, 'like', me, 'le gustó tu comentario.', left(c.body, 80), c.url);
    end if;
    return new;
  end if;
  update comments set likes = greatest(0, likes - 1) where id = old.comment;
  return old;
end $$;
create or replace function on_decision() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'removed' and old.status <> 'removed' and wants(new.user_id, 'mod') then
    insert into notifications (user_id, kind, text, quote, url) values (new.user_id, 'mod', 'La redacción quitó tu comentario por incumplir las reglas de la comunidad.', left(new.body, 80), new.url);
  end if;
  return new;
end $$;

-- ================= 4. Reputation and badges, counted by the server =================
-- Same rules as src/lib/reputation.ts: comments with real text (40+ characters) count, 5 a day at most
-- (+2, or +3 for a reply); +5 per like from another reader; +50 per comment the newsroom features;
-- −30 per comment the newsroom removed (and it stays on record for the "no reports" badges).
alter table comments add column if not exists featured boolean not null default false;
create or replace function reputation(uid uuid) returns jsonb language sql stable security definer set search_path = public as $$
  with mine as (
    select c.*, (c.created_at at time zone 'America/Puerto_Rico')::date as day,
      length(regexp_replace(regexp_replace(c.body, '@\S+', '', 'g'), '[^[:alnum:]]', '', 'g')) >= 30 as real_text
    from comments c where c.user_id = uid
  ), counted as (
    select *, row_number() over (partition by day order by created_at) as n from mine where real_text and status = 'visible'
  )
  select jsonb_build_object(
    'points', greatest(0,
      coalesce((select sum(case when parent is null then 2 else 3 end) from counted where n <= 5), 0)
      + 5 * coalesce((select count(*) from comment_likes l join comments c on c.id = l.comment where c.user_id = uid and l.user_id <> uid), 0)
      + 50 * (select count(*) from mine where featured and status = 'visible')
      - 30 * (select count(*) from mine where status = 'removed')),
    'comments', (select count(*) from mine where status <> 'removed'),
    'likes', coalesce((select count(*) from comment_likes l join comments c on c.id = l.comment where c.user_id = uid and l.user_id <> uid), 0),
    'featured', (select count(*) from mine where featured and status = 'visible'),
    'days', coalesce((select jsonb_agg(distinct to_char(day, 'YYYY-MM-DD')) from counted where n <= 5), '[]'::jsonb),
    'reports', coalesce((select jsonb_agg((extract(epoch from created_at) * 1000)::bigint) from mine where status = 'removed'), '[]'::jsonb)
  );
$$;
-- Several readers at once (the badges next to names in the comments)
create or replace function reputations(uids uuid[]) returns table (user_id uuid, rep jsonb) language sql stable security definer set search_path = public as $$
  select u, reputation(u) from unnest(uids) as u;
$$;

-- ================= 5. Foro Xtra =================
create table if not exists forum_threads (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references profiles on delete cascade,
  cat text not null,
  title text not null check (char_length(title) between 5 and 140),
  body text not null default '' check (char_length(body) <= 2000),
  votes int not null default 0,
  replies int not null default 0,
  status text not null default 'visible' check (status in ('visible', 'removed')),
  created_at timestamptz not null default now()
);
create table if not exists forum_replies (
  id uuid primary key default gen_random_uuid(),
  thread uuid not null references forum_threads on delete cascade,
  user_id uuid not null default auth.uid() references profiles on delete cascade,
  body text not null check (char_length(body) between 1 and 1000),
  votes int not null default 0,
  status text not null default 'visible' check (status in ('visible', 'removed')),
  created_at timestamptz not null default now()
);
create table if not exists forum_votes (
  target uuid not null,              -- a thread or a reply
  kind text not null check (kind in ('thread', 'reply')),
  user_id uuid not null default auth.uid() references profiles on delete cascade,
  value smallint not null check (value in (-1, 1)),
  primary key (target, user_id)
);
alter table forum_threads enable row level security;
alter table forum_replies enable row level security;
alter table forum_votes enable row level security;
drop policy if exists "read threads" on forum_threads;
create policy "read threads" on forum_threads for select using (status = 'visible' or user_id = auth.uid() or staff_role() in ('admin', 'editor'));
drop policy if exists "post threads" on forum_threads;
create policy "post threads" on forum_threads for insert with check (user_id = auth.uid() and votes = 0 and replies = 0 and status = 'visible'
  and not exists (select 1 from profiles where id = auth.uid() and banned));
drop policy if exists "remove threads" on forum_threads;
create policy "remove threads" on forum_threads for delete using (user_id = auth.uid() or staff_role() in ('admin', 'editor'));
drop policy if exists "moderate threads" on forum_threads;
create policy "moderate threads" on forum_threads for update using (staff_role() in ('admin', 'editor'));
drop policy if exists "read replies" on forum_replies;
create policy "read replies" on forum_replies for select using (status = 'visible' or user_id = auth.uid() or staff_role() in ('admin', 'editor'));
drop policy if exists "post replies" on forum_replies;
create policy "post replies" on forum_replies for insert with check (user_id = auth.uid() and votes = 0 and status = 'visible'
  and not exists (select 1 from profiles where id = auth.uid() and banned));
drop policy if exists "remove replies" on forum_replies;
create policy "remove replies" on forum_replies for delete using (user_id = auth.uid() or staff_role() in ('admin', 'editor'));
drop policy if exists "read votes" on forum_votes;
create policy "read votes" on forum_votes for select using (user_id = auth.uid());
drop policy if exists "vote" on forum_votes;
create policy "vote" on forum_votes for all using (user_id = auth.uid()) with check (user_id = auth.uid());
-- Vote totals and reply counts kept up to date by the server
create or replace function on_forum_vote() returns trigger language plpgsql security definer set search_path = public as $$
declare t uuid; k text; d int;
begin
  if tg_op = 'INSERT' then t := new.target; k := new.kind; d := new.value;
  elsif tg_op = 'DELETE' then t := old.target; k := old.kind; d := -old.value;
  else t := new.target; k := new.kind; d := new.value - old.value; end if;
  if k = 'thread' then update forum_threads set votes = votes + d where id = t; else update forum_replies set votes = votes + d where id = t; end if;
  return coalesce(new, old);
end $$;
drop trigger if exists forum_voted on forum_votes;
create trigger forum_voted after insert or update or delete on forum_votes for each row execute function on_forum_vote();
create or replace function on_forum_reply() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then update forum_threads set replies = replies + 1 where id = new.thread; return new; end if;
  update forum_threads set replies = greatest(0, replies - 1) where id = old.thread; return old;
end $$;
drop trigger if exists forum_replied on forum_replies;
create trigger forum_replied after insert or delete on forum_replies for each row execute function on_forum_reply();

-- ================= 6. Saved stories (follow the reader to any device) =================
create table if not exists saved_stories (
  user_id uuid not null default auth.uid() references profiles on delete cascade,
  url text not null,
  data jsonb not null,               -- title, section, date, photo
  created_at timestamptz not null default now(),
  primary key (user_id, url)
);
alter table saved_stories enable row level security;
drop policy if exists "own saved" on saved_stories;
create policy "own saved" on saved_stories for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ================= 7. Juegos Xtra points and leaderboards =================
create table if not exists game_points (
  user_id uuid primary key default auth.uid() references profiles on delete cascade,
  total int not null default 0,
  state jsonb not null default '{}', -- points per game, days played, recent log
  updated_at timestamptz not null default now()
);
alter table game_points enable row level security;
drop policy if exists "read points" on game_points;
create policy "read points" on game_points for select using (true);
drop policy if exists "own points" on game_points;
create policy "own points" on game_points for insert with check (user_id = auth.uid());
drop policy if exists "own points update" on game_points;
create policy "own points update" on game_points for update using (user_id = auth.uid());
-- Leaderboard: all games or one game, all time or one day ("Hoy")
drop function if exists game_leaders(text, int);
create or replace function game_leaders(game text default null, day text default null, lim int default 10) returns table (username text, photo text, points int)
language sql stable security definer set search_path = public as $$
  with s as (
    select p.username, p.photo,
      case
        when day is not null and game is not null then coalesce((g.state -> 'byDay' -> day ->> game)::int, 0)
        when day is not null then coalesce((select sum(v::int) from jsonb_each_text(coalesce(g.state -> 'byDay' -> day, '{}'::jsonb)) as e(k, v)), 0)
        when game is not null then coalesce((g.state -> 'games' ->> game)::int, 0)
        else g.total
      end as pts
    from game_points g join profiles p on p.id = g.user_id
    where not p.banned
  )
  select username, photo, pts from s where pts > 0 order by pts desc limit lim;
$$;

-- ==================================================================
-- reddit.sql
-- ==================================================================
-- Foro Xtra and story comments, Reddit style (2026-10-06): replies to replies, ▲▼ votes on every comment and reply,
-- and ▲ votes in the Foro counting toward the reader's points. Run once in Supabase → SQL Editor. Safe to run again.

-- ================= 1. Foro: replies to replies =================
alter table forum_replies add column if not exists parent uuid references forum_replies on delete cascade;
create index if not exists forum_replies_thread on forum_replies (thread, created_at);
-- A reply can only answer another reply in the same topic
create or replace function check_forum_parent() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.parent is not null and not exists (select 1 from forum_replies where id = new.parent and thread = new.thread) then
    raise exception 'Esa respuesta no es de este tema.';
  end if;
  return new;
end $$;
drop trigger if exists forum_parent_check on forum_replies;
create trigger forum_parent_check before insert on forum_replies for each row execute function check_forum_parent();

-- ================= 2. Comments: ▼ votes (▲ is the existing "Me gusta", comment_likes) =================
alter table comments add column if not exists dislikes int not null default 0;
create or replace function comment_new_zero() returns trigger language plpgsql as $$
begin new.dislikes := 0; return new; end $$;
drop trigger if exists comment_dislikes_zero on comments;
create trigger comment_dislikes_zero before insert on comments for each row execute function comment_new_zero();

create table if not exists comment_dislikes (
  comment uuid references comments on delete cascade,
  user_id uuid not null default auth.uid() references profiles on delete cascade,
  primary key (comment, user_id)
);
alter table comment_dislikes enable row level security;
drop policy if exists "read own dislikes" on comment_dislikes;
create policy "read own dislikes" on comment_dislikes for select using (user_id = auth.uid());
drop policy if exists "dislike" on comment_dislikes;
create policy "dislike" on comment_dislikes for insert with check (user_id = auth.uid()
  and not exists (select 1 from profiles where id = auth.uid() and banned));
drop policy if exists "undislike" on comment_dislikes;
create policy "undislike" on comment_dislikes for delete using (user_id = auth.uid());

-- Totals kept by the server; ▲ and ▼ from the same reader cancel each other (voting one removes the other)
create or replace function on_dislike() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    update comments set dislikes = dislikes + 1 where id = new.comment;
    delete from comment_likes where comment = new.comment and user_id = new.user_id;
    return new;
  end if;
  update comments set dislikes = greatest(0, dislikes - 1) where id = old.comment;
  return old;
end $$;
drop trigger if exists dislike_changed on comment_dislikes;
create trigger dislike_changed after insert or delete on comment_dislikes for each row execute function on_dislike();
create or replace function like_clears_dislike() returns trigger language plpgsql security definer set search_path = public as $$
begin delete from comment_dislikes where comment = new.comment and user_id = new.user_id; return new; end $$;
drop trigger if exists like_clears_dislike on comment_likes;
create trigger like_clears_dislike after insert on comment_likes for each row execute function like_clears_dislike();

-- ================= 3. Points: a ▲ in the Foro counts like a "Me gusta" on a comment (+5) =================
create or replace function reputation(uid uuid) returns jsonb language sql stable security definer set search_path = public as $$
  with mine as (
    select c.*, (c.created_at at time zone 'America/Puerto_Rico')::date as day,
      length(regexp_replace(regexp_replace(c.body, '@\S+', '', 'g'), '[^[:alnum:]]', '', 'g')) >= 30 as real_text
    from comments c where c.user_id = uid
  ), counted as (
    select *, row_number() over (partition by day order by created_at) as n from mine where real_text and status = 'visible'
  ), got as (
    select
      coalesce((select count(*) from comment_likes l join comments c on c.id = l.comment where c.user_id = uid and l.user_id <> uid), 0)
      + coalesce((select count(*) from forum_votes v join forum_threads t on t.id = v.target where v.kind = 'thread' and v.value = 1 and t.user_id = uid and v.user_id <> uid and t.status = 'visible'), 0)
      + coalesce((select count(*) from forum_votes v join forum_replies r on r.id = v.target where v.kind = 'reply' and v.value = 1 and r.user_id = uid and v.user_id <> uid and r.status = 'visible'), 0)
      as likes
  )
  select jsonb_build_object(
    'points', greatest(0,
      coalesce((select sum(case when parent is null then 2 else 3 end) from counted where n <= 5), 0)
      + 5 * (select likes from got)
      + 50 * (select count(*) from mine where featured and status = 'visible')
      - 30 * (select count(*) from mine where status = 'removed')),
    'comments', (select count(*) from mine where status <> 'removed'),
    'likes', (select likes from got),
    'featured', (select count(*) from mine where featured and status = 'visible'),
    'days', coalesce((select jsonb_agg(distinct to_char(day, 'YYYY-MM-DD')) from counted where n <= 5), '[]'::jsonb),
    'reports', coalesce((select jsonb_agg((extract(epoch from created_at) * 1000)::bigint) from mine where status = 'removed'), '[]'::jsonb)
  );
$$;

-- ================= 4. Deleting something that has replies keeps the conversation =================
-- Like Reddit: if others already answered, the text is erased and shows "[eliminado]", but the replies stay.
-- Without replies, it's deleted for good. The author or the newsroom (admin, editor) can do it.
alter table forum_replies add column if not exists deleted boolean not null default false;
alter table comments add column if not exists deleted boolean not null default false;
create or replace function remove_forum_reply(rid uuid) returns text language plpgsql security definer set search_path = public as $$
declare r forum_replies;
begin
  select * into r from forum_replies where id = rid;
  if r.id is null then return 'gone'; end if;
  if r.user_id <> auth.uid() and coalesce(staff_role(), '') not in ('admin', 'editor') then raise exception 'No puedes borrar esta respuesta.'; end if;
  if exists (select 1 from forum_replies where parent = rid) then
    update forum_replies set body = '[eliminado]', deleted = true where id = rid; return 'erased';
  end if;
  delete from forum_replies where id = rid; return 'deleted';
end $$;
create or replace function remove_comment(cid uuid) returns text language plpgsql security definer set search_path = public as $$
declare c comments;
begin
  select * into c from comments where id = cid;
  if c.id is null then return 'gone'; end if;
  if c.user_id <> auth.uid() and coalesce(staff_role(), '') not in ('admin', 'editor') then raise exception 'No puedes borrar este comentario.'; end if;
  if exists (select 1 from comments where parent = cid) then
    update comments set body = '', media = null, deleted = true where id = cid; return 'erased';
  end if;
  delete from comments where id = cid; return 'deleted';
end $$;
grant execute on function remove_forum_reply(uuid) to authenticated;
grant execute on function remove_comment(uuid) to authenticated;

-- ==================================================================
-- anti-spam.sql
-- ==================================================================
-- NotiCel: protection against spam, flooding and cheating, checked by the server (run once in Supabase → SQL Editor;
-- safe to run again). The site already checks comments in the browser (src/lib/moderation.ts), but anyone can skip the
-- browser and talk to the database directly, so the same rules live here too. Staff are never limited.
--   1. Comments: speed limits, no repeated comments, and the word filter (clear violations blocked, doubtful → review).
--   2. Foro Xtra topics and replies: speed limits, no repeats, clear violations blocked.
--   3. Reports: at most 30 a day per reader.
--   4. Ad requests (Anúnciate): at most 3 a day per email and 40 an hour in total; size limits; "paid" only right after sending.
--   5. Uploads: request images (anyone) at most 150 an hour in total; comment photos at most 20 a day per reader.
--   6. Ad views: at most 30 an hour from one internet connection for the same ad, so nobody can burn a campaign's views.
--   7. Juegos Xtra points: no impossible jumps in the leaderboard.

-- ---------- The word filter, same rules as src/lib/moderation.ts (score 60+ = block, 25+ = review) ----------
create or replace function nc_score(txt text) returns int language plpgsql immutable as $$
declare
  t text := translate(lower(coalesce(txt, '')), 'áéíóúüñàèìòù', 'aeiouunaeiou');
  w text; n int; s int := 0; links int;
  insults text[] := array['pendej', 'cabron', 'punet', 'mamao', 'charro', 'idiota', 'estupid', 'imbecil', 'bruto', 'animal', 'basura', 'cerdo', 'puerc', 'mierd', 'carajo', 'hdp', 'hijo de puta', 'puta', 'maric', 'loca de remate'];
  hate text[] := array['negro de mierda', 'sudaca', 'maricon', 'pato', 'gringo asqueroso', 'dominicano de mierda', 'raza inferior'];
  threats text[] := array['te voy a matar', 'te mato', 'te voy a dar', 'ojala te mueras', 'ojala se muera', 'hay que matarl', 'te voy a buscar', 'se que donde vives', 'se donde vives', 'te voy a romper'];
  spam text[] := array['gana dinero', 'dinero facil', 'trabaja desde casa', 'haz clic', 'compra ahora', 'oferta exclusiva', 'whatsapp me', 'escribeme al', 'inversion segura', 'cripto gratis', 'bitcoin gratis'];
  sp boolean := false;
begin
  n := 0; foreach w in array insults loop if t ~ ('(^|[^a-z])' || replace(w, ' ', '\s+')) then n := n + 1; end if; end loop;
  if n > 0 then s := s + 45 + 10 * (n - 1); end if;
  foreach w in array hate loop if t ~ ('(^|[^a-z])' || replace(w, ' ', '\s+')) then s := s + 70; exit; end if; end loop;
  foreach w in array threats loop if t ~ ('(^|[^a-z])' || replace(w, ' ', '\s+')) then s := s + 80; exit; end if; end loop;
  foreach w in array spam loop if t ~ ('(^|[^a-z])' || replace(w, ' ', '\s+')) then sp := true; exit; end if; end loop;
  links := (select count(*) from regexp_matches(t, 'https?://|www\.', 'g'));
  if sp or links >= 2 then s := s + 40 + case when links >= 2 then 20 else 0 end; elsif links = 1 then s := s + 15; end if;
  if t ~ '\d{3}[-.\s]?\d{3}[-.\s]?\d{4}' then s := s + 45; end if;                -- phone number
  if t ~ '[a-z0-9._+-]+@[a-z0-9-]+\.[a-z]{2,}' then s := s + 35; end if;          -- email
  if t ~ '(^|[^0-9])\d{3}-\d{2}-\d{4}([^0-9]|$)' then s := s + 90; end if;       -- social security
  if t ~ '(^|[^a-z])(calle|ave\.?|avenida|urb\.?|urbanizacion|carr\.?|carretera)\s+\w+.*[^0-9]\d{1,5}([^0-9]|$)' then s := s + 30; end if; -- street address
  if t ~ '(.)\1\1\1\1\1\1\1' then s := s + 10; end if;                                    -- flooding: the same letter 8+ times
  return least(100, s);
end $$;

-- ---------- 1. Comments ----------
create or replace function guard_comment() returns trigger language plpgsql security definer set search_path = public as $$
declare sc int;
begin
  if staff_role() is not null then return new; end if;
  if exists (select 1 from comments where user_id = new.user_id and created_at > now() - interval '15 seconds') then
    raise exception 'Espera unos segundos antes de comentar otra vez.' using errcode = 'P0001';
  end if;
  if (select count(*) from comments where user_id = new.user_id and created_at > now() - interval '10 minutes') >= 8 then
    raise exception 'Has comentado mucho en poco tiempo. Espera unos minutos.' using errcode = 'P0001';
  end if;
  if (select count(*) from comments where user_id = new.user_id and created_at > now() - interval '1 day') >= 60 then
    raise exception 'Llegaste al límite de comentarios por hoy. Vuelve mañana.' using errcode = 'P0001';
  end if;
  if length(trim(new.body)) > 0 and exists (select 1 from comments where user_id = new.user_id and created_at > now() - interval '1 day' and lower(trim(body)) = lower(trim(new.body))) then
    raise exception 'Ya publicaste ese mismo comentario.' using errcode = 'P0001';
  end if;
  sc := nc_score(new.body);
  if sc >= 60 then raise exception 'No se puede publicar: el texto incumple las reglas de la comunidad. Revísalo.' using errcode = 'P0001'; end if;
  -- Doubtful text, or a link from an account less than a day old, waits for the newsroom (the browser can't lower this)
  if sc >= 25 or (new.body ~* '(https?://|www\.)' and (select created_at from profiles where id = new.user_id) > now() - interval '1 day') then
    new.status := 'review';
  end if;
  if new.status not in ('visible', 'review') then new.status := 'review'; end if;
  new.likes := 0; new.reports := 0; new.featured := false; new.created_at := now();
  return new;
end $$;
drop trigger if exists comment_guard on comments;
create trigger comment_guard before insert on comments for each row execute function guard_comment();

-- ---------- 2. Foro Xtra ----------
create or replace function guard_forum() returns trigger language plpgsql security definer set search_path = public as $$
declare txt text;
begin
  if staff_role() is not null then return new; end if;
  if tg_table_name = 'forum_threads' then
    txt := new.title || ' ' || new.body;
    if exists (select 1 from forum_threads where user_id = new.user_id and created_at > now() - interval '2 minutes') then
      raise exception 'Espera un par de minutos antes de proponer otro tema.' using errcode = 'P0001';
    end if;
    if (select count(*) from forum_threads where user_id = new.user_id and created_at > now() - interval '1 day') >= 5 then
      raise exception 'Puedes proponer hasta 5 temas al día. Vuelve mañana.' using errcode = 'P0001';
    end if;
    if exists (select 1 from forum_threads where user_id = new.user_id and lower(trim(title)) = lower(trim(new.title)) and created_at > now() - interval '7 days') then
      raise exception 'Ya propusiste un tema con ese título.' using errcode = 'P0001';
    end if;
  else
    txt := new.body;
    if exists (select 1 from forum_replies where user_id = new.user_id and created_at > now() - interval '15 seconds') then
      raise exception 'Espera unos segundos antes de responder otra vez.' using errcode = 'P0001';
    end if;
    if (select count(*) from forum_replies where user_id = new.user_id and created_at > now() - interval '10 minutes') >= 10 then
      raise exception 'Has respondido mucho en poco tiempo. Espera unos minutos.' using errcode = 'P0001';
    end if;
    if (select count(*) from forum_replies where user_id = new.user_id and created_at > now() - interval '1 day') >= 80 then
      raise exception 'Llegaste al límite de respuestas por hoy. Vuelve mañana.' using errcode = 'P0001';
    end if;
    if exists (select 1 from forum_replies where user_id = new.user_id and lower(trim(body)) = lower(trim(new.body)) and created_at > now() - interval '1 day') then
      raise exception 'Ya publicaste esa misma respuesta.' using errcode = 'P0001';
    end if;
  end if;
  if nc_score(txt) >= 60 then raise exception 'No se puede publicar: el texto incumple las reglas de la comunidad. Revísalo.' using errcode = 'P0001'; end if;
  new.created_at := now();
  return new;
end $$;
drop trigger if exists forum_thread_guard on forum_threads;
create trigger forum_thread_guard before insert on forum_threads for each row execute function guard_forum();
drop trigger if exists forum_reply_guard on forum_replies;
create trigger forum_reply_guard before insert on forum_replies for each row execute function guard_forum();

-- ---------- 3. Reports ----------
create or replace function guard_report() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if staff_role() is null and (select count(*) from comment_reports where user_id = new.user_id and created_at > now() - interval '1 day') >= 30 then
    raise exception 'Llegaste al límite de reportes por hoy. Gracias por ayudar.' using errcode = 'P0001';
  end if;
  new.created_at := now();
  return new;
end $$;
drop trigger if exists report_guard on comment_reports;
create trigger report_guard before insert on comment_reports for each row execute function guard_report();

-- ---------- 4. Ad requests ----------
create or replace function guard_ad_request() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if staff_role() is not null then return new; end if;
  if (select count(*) from ad_requests where created_at > now() - interval '1 hour') >= 40 then
    raise exception 'Estamos recibiendo muchas solicitudes. Intenta otra vez en un rato.' using errcode = 'P0001';
  end if;
  if (select count(*) from ad_requests where lower(client ->> 'email') = lower(new.client ->> 'email') and created_at > now() - interval '1 day') >= 3 then
    raise exception 'Ya recibimos varias solicitudes de este correo hoy. Te contactaremos pronto.' using errcode = 'P0001';
  end if;
  if length(new.client::text) > 3000 or length(new.art::text) > 20000 or length(array_to_string(new.lines, ' ')) > 5000
     or length(coalesce(new.link, '')) > 500 or cardinality(new.formats) > 20 then
    raise exception 'La solicitud es demasiado grande.' using errcode = 'P0001';
  end if;
  new.created_at := now(); new.note := null;
  return new;
end $$;
drop trigger if exists ad_request_guard on ad_requests;
create trigger ad_request_guard before insert on ad_requests for each row execute function guard_ad_request();
-- The page marks a request paid when the client comes back from Stripe or ATH Móvil. Until payments confirm themselves
-- (a Stripe webhook, later), only allow it in the first 3 hours, and staff check the payment before approving.
create or replace function mark_request_paid(rid text) returns void language sql security definer set search_path = public as $$
  update ad_requests set paid = true where id = rid and paid = false and created_at > now() - interval '3 hours';
$$;

-- ---------- 5. Uploads ----------
create or replace function nc_recent_uploads(bucket text, owner_folder text default null) returns int
language sql stable security definer set search_path = public, storage as $$
  select count(*)::int from storage.objects
  where bucket_id = bucket and created_at > now() - case when owner_folder is null then interval '1 hour' else interval '1 day' end
    and (owner_folder is null or (storage.foldername(name))[1] = owner_folder);
$$;
drop policy if exists "anyone uploads request images" on storage.objects;
create policy "anyone uploads request images" on storage.objects for insert
  with check (bucket_id = 'solicitudes' and nc_recent_uploads('solicitudes') < 150);
drop policy if exists "own comment photo upload" on storage.objects;
create policy "own comment photo upload" on storage.objects for insert to authenticated
  with check (bucket_id = 'comentarios' and (storage.foldername(name))[1] = auth.uid()::text and nc_recent_uploads('comentarios', auth.uid()::text) < 20);

-- ---------- 6. Ad views ----------
create table if not exists ad_view_seen (ip text, campaign_id text, hr timestamptz, n int not null default 1, primary key (ip, campaign_id, hr));
alter table ad_view_seen enable row level security; -- nobody reads it; only ad_view() writes it
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
  update ad_campaigns set status = 'ended' where id = cid and views is not null and (select views from ad_stats where campaign_id = cid) >= views;
end $$;
create or replace function ad_click(cid text) returns void language sql security definer set search_path = public as $$
  insert into ad_stats (campaign_id, clicks) select cid, 1 where exists (select 1 from ad_campaigns where id = cid)
  on conflict (campaign_id) do update set clicks = ad_stats.clicks + 1, updated_at = now();
$$;
grant execute on function ad_view(text), ad_click(text) to anon, authenticated;

-- ---------- 7. Juegos Xtra points ----------
-- The biggest prize in a game is about 150 points; a new account may bring what it earned on the device before logging in.
create or replace function guard_points() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if length(new.state::text) > 60000 then raise exception 'Datos de juego demasiado grandes.' using errcode = 'P0001'; end if;
  if tg_op = 'INSERT' then
    new.total := least(new.total, 3000);
  elsif old.updated_at > now() - interval '5 seconds' and new.total > old.total then
    new.total := old.total;                       -- too fast: keep the old total (the device sends it again later)
  else
    new.total := least(new.total, old.total + 600); -- a big jump grows a little at a time instead
  end if;
  new.updated_at := now();
  return new;
end $$;
drop trigger if exists points_guard on game_points;
create trigger points_guard before insert or update on game_points for each row execute function guard_points();

-- ==================================================================
-- fotos.sql
-- ==================================================================
-- NotiCel: photo library (panel → Fotos, and "Elegir de la biblioteca" in Escribir). Run once in Supabase →
-- SQL Editor. Safe to run again.
-- This table is the library's index: what each photo shows and where its files are. The files themselves can live
-- anywhere (today the "noticias" storage bucket; later Cloudflare R2, Cloudinary or another service): only `src`
-- and `thumb` point there, so changing storage never changes the search.

create extension if not exists pg_trgm; -- fast "contains" search, even with 100,000 photos

create table if not exists photos (
  id uuid primary key default gen_random_uuid(),
  src text not null,                 -- the web version (about 2000 px)
  thumb text not null,               -- the small version for the grid (about 480 px)
  width int, height int,
  caption text not null default '',  -- what the photo shows (the story's caption)
  credit text not null default '',   -- "Foto: Nombre / NotiCel"
  credit_url text not null default '',
  place text not null default '',    -- e.g. San Juan, Capitolio
  people text not null default '',   -- who appears
  tags text not null default '',     -- words to find it, separated by commas
  taken_on date,                     -- when it was taken (if known)
  storage text not null default 'supabase', -- where the files are: supabase, r2, cloudinary, drive...
  path text,                         -- the file's name in that storage (to delete it)
  uploaded_by uuid default auth.uid() references auth.users on delete set null,
  uploaded_by_name text,
  created_at timestamptz not null default now(),
  -- Everything searchable in one lowercase, accent-free text (search sends the words the same way)
  search text generated always as (
    translate(lower(caption || ' ' || credit || ' ' || place || ' ' || people || ' ' || tags), 'áéíóúüñàèìòù', 'aeiouunaeiou')
  ) stored
);
create index if not exists photos_search on photos using gin (search gin_trgm_ops);
create index if not exists photos_created on photos (created_at desc);

alter table photos enable row level security;
-- The whole team can see and add photos; whoever uploaded a photo (or an editor/admin) can change it; editors and the
-- admin can delete
drop policy if exists "staff see photos" on photos;
create policy "staff see photos" on photos for select using (staff_role() is not null);
drop policy if exists "staff add photos" on photos;
create policy "staff add photos" on photos for insert with check (staff_role() is not null and uploaded_by = auth.uid());
drop policy if exists "staff edit photos" on photos;
create policy "staff edit photos" on photos for update using (uploaded_by = auth.uid() or staff_role() in ('admin', 'editor'));
drop policy if exists "editors delete photos" on photos;
create policy "editors delete photos" on photos for delete using (staff_role() in ('admin', 'editor'));

-- Deleting a photo also removes its files from the "noticias" bucket (library files live in noticias/biblioteca/)
drop policy if exists "editors delete library files" on storage.objects;
create policy "editors delete library files" on storage.objects for delete
  using (bucket_id = 'noticias' and (storage.foldername(name))[1] = 'biblioteca' and staff_role() in ('admin', 'editor'));

-- ==================================================================
-- salud.sql
-- ==================================================================
-- Salud del sitio (staff panel): the numbers the page shows, and a log of failed publishing.
-- Run once in Supabase → SQL Editor. Safe to run again.

-- Failed publishing from the panel (publish, schedule, take down). Any staff member can add a line;
-- editors and the admin read them; the admin clears them.
create table if not exists panel_errors (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  who text not null default '' check (char_length(who) <= 60),
  what text not null check (char_length(what) <= 200),
  detail text not null default '' check (char_length(detail) <= 500)
);
alter table panel_errors enable row level security;
drop policy if exists "staff log errors" on panel_errors;
create policy "staff log errors" on panel_errors for insert with check (staff_role() is not null);
drop policy if exists "editors read errors" on panel_errors;
create policy "editors read errors" on panel_errors for select using (staff_role() in ('admin', 'editor'));
drop policy if exists "admin clears errors" on panel_errors;
create policy "admin clears errors" on panel_errors for delete using (staff_role() = 'admin');

-- Comments, accounts and storage in one call (editors and the admin only).
-- Comments the word filter blocks are never saved, so they can't be counted here.
create or replace function panel_stats() returns json
language plpgsql stable security definer set search_path = public, storage as $$
declare
  today timestamptz := date_trunc('day', now() at time zone 'America/Puerto_Rico') at time zone 'America/Puerto_Rico';
begin
  if coalesce(staff_role(), '') not in ('admin', 'editor') then
    raise exception 'Solo editores y el administrador.' using errcode = 'P0001';
  end if;
  return json_build_object(
    'comments_today', (select count(*) from comments where created_at >= today),
    'review_today', (select count(*) from comments where created_at >= today and status = 'review'),
    'review_now', (select count(*) from comments where status = 'review'),
    'removed_week', (select count(*) from comments where created_at >= now() - interval '7 days' and status = 'removed'),
    'signups_week', (select count(*) from profiles where created_at >= now() - interval '7 days'),
    'accounts', (select count(*) from profiles),
    'banned', (select count(*) from profiles where banned),
    'storage_bytes', (select coalesce(sum((metadata->>'size')::bigint), 0) from storage.objects),
    'db_bytes', pg_database_size(current_database())
  );
end $$;
revoke all on function panel_stats() from public;
grant execute on function panel_stats() to authenticated;

-- ==================================================================
-- delete-account.sql
-- ==================================================================
-- NotiCel: "Borrar mi cuenta" (Mi perfil → Ajustes). Run once in Supabase → SQL Editor. Safe to run again.
-- Deleting the account removes the profile and, through the tables' links, everything tied to it: comments, likes,
-- reports, notifications, Foro topics and replies, saved stories, game points and the staff role. The site first
-- deletes the reader's own photos (profile photo and photos in comments) from storage.

-- Readers can see and delete only their own files (their folder is their account id)
drop policy if exists "own files read" on storage.objects;
create policy "own files read" on storage.objects for select to authenticated
  using (bucket_id in ('avatars', 'comentarios') and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "own files delete" on storage.objects;
create policy "own files delete" on storage.objects for delete to authenticated
  using (bucket_id in ('avatars', 'comentarios') and (storage.foldername(name))[1] = auth.uid()::text);

create or replace function delete_my_account() returns text language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid();
begin
  if uid is null then return 'Entra a tu cuenta primero.'; end if;
  -- The site always needs at least one administrator
  if exists (select 1 from staff where user_id = uid and role = 'admin') and (select count(*) from staff where role = 'admin') <= 1 then
    return 'Eres el único administrador. Nombra a otra persona como administrador en el panel (Equipo) antes de borrar tu cuenta.';
  end if;
  delete from auth.users where id = uid; -- the profile and everything linked to it go with it
  return 'ok';
end $$;
revoke all on function delete_my_account() from public, anon;
grant execute on function delete_my_account() to authenticated;

-- ==================================================================
-- storage-read.sql
-- ==================================================================
-- NotiCel: lets staff read the files in the "anuncios" and "noticias" storage buckets (run once in SQL Editor).
-- Supabase needs this read permission when an upload replaces a file with the same name (ad images use fixed names).
create policy "staff read uploaded files" on storage.objects for select
  using (bucket_id in ('anuncios', 'noticias') and staff_role() is not null);
