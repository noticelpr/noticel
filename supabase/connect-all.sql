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
