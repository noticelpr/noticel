// Fast publishing (2026-11-16): the stories published since this copy of the site was built, newest first, for the
// home page, the section pages and the Última hora bar (the script in src/layouts/Base.astro). Empty right after a
// build, when every story is already on the built pages. Kept 10 seconds in Cloudflare's cache (functions/_lib/live.js).
//   GET /api/recientes → { stories: [{ path, title, section, sectionName, sectionPath, image, breaking, date }] }
import { liveList, sectionOf } from '../_lib/live.js';

export async function onRequestGet({ request, env, waitUntil }) {
  const list = await liveList(env, new URL(request.url), waitUntil);
  const stories = list.filter((s) => !s.deleted).slice(0, 30).map((s) => {
    const sec = sectionOf(s.section);
    return { path: s.path, title: s.title, section: s.section, sectionName: sec.name, sectionPath: sec.url, image: s.image, breaking: s.breaking, date: s.publish_at };
  });
  const gone = list.filter((s) => s.deleted).map((s) => s.path); // deleted stories: the pages hide their links
  return new Response(JSON.stringify({ stories, gone }), { headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'public, max-age=10' } });
}
