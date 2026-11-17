-- NotiCel · comment badges for columnist accounts (user, 2026-11-17). Run once in Supabase → SQL Editor (safe to run
-- again). Order: after supabase/columnistas-solicitudes.sql (the 'columnist' role) and supabase/comentarios.sql (which
-- made the first team_badges; this replaces it, keeping its titles).
-- Anyone with the Columnista role shows "Columnista" next to their name in the comments, linked to their profile on
-- /opinion/<slug>/: the profile tied to their account (owner), or else the one with their name. Everyone else keeps
-- NotiCel's titles: Periodista (periodistas and Editors), Editor en jefe, or "NotiCel".
create or replace function team_badges(ids uuid[]) returns table (user_id uuid, title text, slug text)
language sql stable security definer set search_path = public as $$
  select s.user_id,
         case when s.role = 'columnist' or c.slug is not null then 'Columnista'
              when s.role in ('reporter', 'desk') then 'Periodista'
              when s.role = 'editor' then 'Editor en jefe'
              else 'NotiCel' end,
         c.slug
  from staff s
  left join lateral (
    select slug from columnists
    where active and coalesce(kind, 'columnista') = 'columnista'
      and (owner = s.user_id or (s.role = 'columnist' and lower(name) = lower(s.name)))
    order by coalesce(owner = s.user_id, false) desc, sort limit 1
  ) c on true
  where s.user_id = any(ids);
$$;
grant execute on function team_badges(uuid[]) to anon, authenticated;
