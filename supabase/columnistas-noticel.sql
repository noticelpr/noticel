-- NotiCel · columnists from noticel.com (made by scripts/columnists-wp.mjs on 2026-11-16).
-- Run ONCE in Supabase → SQL Editor (safe to run again). Adds the columnists who write on noticel.com and are missing,
-- and fills each profile's EMPTY fields with noticel.com's own: job title, bio (their author page), photo (their
-- WordPress picture, on cdn.noticel.com) and the videos in their columns. Anything already written in the panel stays.
alter table columnists add column if not exists videos jsonb not null default '[]';
insert into columnists (slug, name, role, bio, photo, videos, active, sort) values
('luisito-vigoreaux', 'Luisito Vigoreaux', 'Columnista Cultural y de Entretenimiento', 'Luisito Vigoreaux, destacado actor, productor y presentador puertorriqueño, es una figura icónica en la televisión y el entretenimiento de Puerto Rico. Hijo del legendario Luis Vigoreaux Rivera, ha brillado en programas como Parejo, Doble y Triple, Sábado en Grande, El Show del Mediodía y Sunshine’s Café, donde su carisma y humor auténtico conquistaron al público. Como productor y presentador, ha colaborado con talentos como Desiree Lowry y Sunshine Logroño, destacándose por su estilo audaz y cercano. Ahora, como columnista de NotiCel, Luisito aporta su experiencia y perspectiva única sobre la cultura, el entretenimiento y la vida puertorriqueña.', 'https://cdn.noticel.com/2025/08/05215125/cropped-Screenshot-2025-08-05-at-5.51.09 PM-e1754430709997.png', '["https://www.youtube.com/watch?v=0WuCYiy-HC4","https://www.youtube.com/watch?v=l3nNHoz2Ows","https://www.youtube.com/watch?v=ZB8Dz3m-c20","https://www.youtube.com/watch?v=YGXfYBejnNc","https://www.youtube.com/watch?v=1Wd3lWw0BcQ","https://www.youtube.com/watch?v=RGqcDJXWyPQ","https://www.youtube.com/watch?v=FR31dcgZEOg","https://www.youtube.com/watch?v=hDhh3hb8fiA","https://www.youtube.com/watch?v=X3-0incEkUY","https://www.youtube.com/watch?v=zufFJS1HHiY","https://www.youtube.com/watch?v=2Dz9A5fM5PE"]'::jsonb, true, 1),
('larry-alicea-rodriguez', 'Larry Alicea Rodríguez', 'Columnista', null, 'https://cdn.noticel.com/2026/10/22013614/cropped-WhatsApp-Image-2026-10-21-at-5.39.58-PM-1.jpeg', '[]'::jsonb, true, 11),
('enid-m-gavilan', 'Enid M. Gavilán', 'Columnista', null, null, '[]'::jsonb, true, 4),
('lcdo-ramon-alejandro-pabon', 'Lcdo. Ramón Alejandro Pabón', 'Columnista', null, null, '[]'::jsonb, true, 2),
('roberto-perez-nieves', 'Roberto Pérez Nieves', 'Columnista', null, 'https://cdn.noticel.com/2026/10/27162506/cropped-WhatsApp-Image-2026-10-26-at-2.57.18-PM.jpeg', '[]'::jsonb, true, 14),
('lcdo-walter-perez', 'Lcdo. Walter Pérez', 'Columnista', null, 'https://cdn.noticel.com/2026/09/18230533/cropped-WhatsApp-Image-2026-09-18-at-4.12.37-PM.jpeg', '[]'::jsonb, true, 9),
('carlos-salgado', 'Carlos Salgado', 'Columnista', 'Juez del Tribunal de Apelaciones y Presidente de la Federacion de la Magistratura de Puerto Rico', 'https://cdn.noticel.com/2026/05/12131444/cropped-salgado.jpg', '[]'::jsonb, true, 3),
('lcda-lisoannette-gonzalez', 'Lcda. Lisoannette González', 'Abogada', null, null, '[]'::jsonb, true, 6)
on conflict (slug) do update set
  role = case when coalesce(columnists.role, '') in ('', 'Columnista') then excluded.role else columnists.role end,
  bio = coalesce(nullif(columnists.bio, ''), excluded.bio),
  photo = coalesce(nullif(columnists.photo, ''), excluded.photo),
  videos = case when columnists.videos is null or columnists.videos = '[]'::jsonb then excluded.videos else columnists.videos end;
