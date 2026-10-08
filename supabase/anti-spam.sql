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
