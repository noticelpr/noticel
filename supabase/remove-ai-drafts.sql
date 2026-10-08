-- NotiCel: removes the "Redactar con IA" tables (the idea was dropped on 2026-10-03). Run once in Supabase → SQL Editor.
-- Nothing else on the site uses them. Safe to run again.
drop table if exists ai_generations;
drop table if exists ai_outlets;
