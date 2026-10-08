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
