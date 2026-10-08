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
