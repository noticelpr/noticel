-- NotiCel · comments, like Noticias Xtra (2026-11-15). Run ONCE in Supabase → SQL Editor → New query → paste → Run (safe
-- to run again). What it adds: team badges next to names in the comments (Periodista, Editor en jefe, Columnista),
-- comments and Foro rules (no word filter; no ads, links, phone numbers or emails; sensible speed limits), and scams
-- (crypto, forex, "investments" with promised earnings) blocked like spam. Everything else stays.

-- ==================================================================
-- insignias.sql (from Noticias Xtra)
-- ==================================================================
-- Team badges in the comments (user, 2026-11-03): next to a team member's name, their position — Periodista (also
-- for the Editor role), Editor en jefe, or Columnista (with a link to their profile page); everyone else on the team
-- (Administrador, Gerente, Ventas) shows "NotiCel".
-- Run once in Supabase → SQL Editor (safe to run again). Readers only learn who is on the team and their public title.
create or replace function team_badges(ids uuid[]) returns table (user_id uuid, title text, slug text)
language sql stable security definer set search_path = public as $$
  select s.user_id,
         case when c.slug is not null then 'Columnista'
              when s.role in ('reporter', 'desk') then 'Periodista'
              when s.role = 'editor' then 'Editor en jefe'
              else 'NotiCel' end,
         c.slug
  from staff s
  left join lateral (select slug from columnists where owner = s.user_id and active and coalesce(kind, 'columnista') = 'columnista' order by sort limit 1) c on true
  where s.user_id = any(ids);
$$;
grant execute on function team_badges(uuid[]) to anon, authenticated;

-- ==================================================================
-- limites-comentarios.sql (from Noticias Xtra)
-- ==================================================================
-- Comments and Foro (user, 2026-11-03): no word filter; no ads (links, web addresses, phone numbers, emails); no photos;
-- looser speed limits for real conversations: 5 seconds between comments, 30 every 10 minutes, 200 a day (same for
-- Foro replies). The team has no limits. Run once in Supabase → SQL Editor (safe to run again). Replaces
-- guard_comment() and guard_forum() from supabase/anti-spam.sql and adds nx_has_ad().
create or replace function nx_has_ad(txt text) returns boolean language sql immutable as $$
  select coalesce(txt, '') ~* '(https?://|www\.|\m[a-z0-9-]+\.(com|net|org|pr|io|info|biz|shop|store|online|site|app|xyz)\M)'
      or coalesce(txt, '') ~ '(^|[^0-9])(\+?1[\s.\-]?)?\(?\d{3}\)?[\s.\-]?\d{3}[\s.\-]?\d{4}($|[^0-9])'
      or coalesce(txt, '') ~ '(^|[^0-9])\d{3}-\d{4}($|[^0-9])'
      or coalesce(txt, '') ~* '[a-z0-9._%+\-]+@[a-z0-9.\-]+\.[a-z]{2,}';
$$;

create or replace function guard_comment() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if staff_role() is not null then return new; end if;
  if exists (select 1 from comments where user_id = new.user_id and created_at > now() - interval '5 seconds') then
    raise exception 'Espera unos segundos antes de comentar otra vez.' using errcode = 'P0001';
  end if;
  if (select count(*) from comments where user_id = new.user_id and created_at > now() - interval '10 minutes') >= 30 then
    raise exception 'Has comentado mucho en poco tiempo. Espera unos minutos.' using errcode = 'P0001';
  end if;
  if (select count(*) from comments where user_id = new.user_id and created_at > now() - interval '1 day') >= 200 then
    raise exception 'Llegaste al límite de comentarios por hoy. Vuelve mañana.' using errcode = 'P0001';
  end if;
  if length(trim(new.body)) > 0 and exists (select 1 from comments where user_id = new.user_id and created_at > now() - interval '1 day' and lower(trim(body)) = lower(trim(new.body))) then
    raise exception 'Ya publicaste ese mismo comentario.' using errcode = 'P0001';
  end if;
  if nx_has_ad(new.body) then
    raise exception 'No se permiten enlaces, números de teléfono ni correos en los comentarios.' using errcode = 'P0001';
  end if;
  -- No photos in comments (user, 2026-11-03): they can't be checked automatically. Stickers and GIFs are fine.
  if new.media is not null and new.media->>'kind' = 'photo' then
    raise exception 'Ya no se pueden poner fotos en los comentarios.' using errcode = 'P0001';
  end if;
  if new.status not in ('visible', 'review') then new.status := 'review'; end if;
  new.likes := 0; new.reports := 0; new.featured := false; new.created_at := now();
  return new;
end $$;

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
    if exists (select 1 from forum_replies where user_id = new.user_id and created_at > now() - interval '5 seconds') then
      raise exception 'Espera unos segundos antes de responder otra vez.' using errcode = 'P0001';
    end if;
    if (select count(*) from forum_replies where user_id = new.user_id and created_at > now() - interval '10 minutes') >= 30 then
      raise exception 'Has respondido mucho en poco tiempo. Espera unos minutos.' using errcode = 'P0001';
    end if;
    if (select count(*) from forum_replies where user_id = new.user_id and created_at > now() - interval '1 day') >= 200 then
      raise exception 'Llegaste al límite de respuestas por hoy. Vuelve mañana.' using errcode = 'P0001';
    end if;
    if exists (select 1 from forum_replies where user_id = new.user_id and lower(trim(body)) = lower(trim(new.body)) and created_at > now() - interval '1 day') then
      raise exception 'Ya publicaste esa misma respuesta.' using errcode = 'P0001';
    end if;
  end if;
  if nx_has_ad(txt) then raise exception 'No se permiten enlaces, números de teléfono ni correos en el Foro.' using errcode = 'P0001'; end if;
  new.created_at := now();
  return new;
end $$;

-- ==================================================================
-- comentarios-estafas.sql (from Noticias Xtra)
-- ==================================================================
-- NotiCel · comments (user, 2026-11-06): every comment stays except ads, spam and scams. Run once in
-- Supabase → SQL Editor (safe to run again). Adds scams (crypto, forex or "investments" with promised earnings or a
-- contact request, fake prizes) to nx_has_ad(), which already blocks links, web addresses, phone numbers and emails
-- before a comment or Foro reply is posted. Same rule as adIn() in src/lib/moderation.ts.
create or replace function nx_has_ad(txt text) returns boolean language sql immutable as $$
  select coalesce(txt, '') ~* '(https?://|www\.|\m[a-z0-9-]+\.(com|net|org|pr|io|info|biz|shop|store|online|site|app|xyz)\M)'
      or coalesce(txt, '') ~ '(^|[^0-9])(\+?1[\s.\-]?)?\(?\d{3}\)?[\s.\-]?\d{3}[\s.\-]?\d{4}($|[^0-9])'
      or coalesce(txt, '') ~ '(^|[^0-9])\d{3}-\d{4}($|[^0-9])'
      or coalesce(txt, '') ~* '[a-z0-9._%+\-]+@[a-z0-9.\-]+\.[a-z]{2,}'
      or coalesce(txt, '') ~* '(bitcoin|btc|usdt|cripto|forex|binance|inversi[oó]n|invierte|trading)[^.!?]{0,80}(gana|ganancia|ganar|rendimiento|ingreso|escrib|contact|telegram|whatsapp|\mdm\M|inbox|privado)'
      or coalesce(txt, '') ~* '(ganaste|has sido seleccionad|reclama tu premio|premio de \$)';
$$;
