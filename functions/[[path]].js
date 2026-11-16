// NotiCel archive (2026-11-15): every old noticel.com story keeps working at its old address.
// The site builds the recent stories ahead of time. For any other address, this asks the archive in NotiCel's R2
// bucket "noticel-archivo": 4,096 compressed files (historias/<000-fff>.json.gz, made by scripts/archive-stories.mjs);
// the file is picked by a short code worked out from the address (shardOf, the same as the script). When the story is
// there, it fills the archive template (the hidden page /archivo-plantilla/, built from
// src/content/noticias/zz-archivo-plantilla.md) and shows it with the site's look, ads and comments. Addresses that
// aren't in the archive either get the normal "not found" page.
//
// Setup, once (Cloudflare → Workers & Pages → the NotiCel Pages project → Settings → Bindings → Add → R2 bucket):
//   Variable name ARCHIVO, bucket noticel-archivo. Without it the site works as before, just without old stories.

import { TEMPLATE, notFound, storyPage } from './_lib/page.js';

/** The archive file a story lives in (same as scripts/archive-stories.mjs). */
function shardOf(path) {
  let h = 0x811c9dc5;
  for (let i = 0; i < path.length; i++) { h ^= path.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return (h >>> 0).toString(16).padStart(8, '0').slice(0, 3);
}


export async function onRequest({ request, env, next }) {
  const url = new URL(request.url);
  // The template itself is never a page of its own
  if (url.pathname.replace(/\/?$/, '/') === TEMPLATE) return notFound(env, url);
  const res = await next();
  if (res.status !== 404 || !['GET', 'HEAD'].includes(request.method) || !env.ARCHIVO) return res;

  // Old addresses are /<category>/.../<date>/<slug>/ ; WordPress writes accents as lowercase %xx
  const path = url.pathname.replace(/%[0-9A-F]{2}/g, (m) => m.toLowerCase()).replace(/\/?$/, '/');
  if (path.split('/').filter(Boolean).length < 2) return res;
  const obj = await env.ARCHIVO.get(`historias/${shardOf(path)}.json.gz`).catch(() => null);
  if (!obj) return res;
  const group = await new Response(obj.body.pipeThrough(new DecompressionStream('gzip'))).json().catch(() => ({}));
  const s = group[path];
  if (!s) return res;
  if (!url.pathname.endsWith('/')) return Response.redirect(`${url.origin}${url.pathname}/${url.search}`, 301); // like WordPress

  const page = await storyPage(env, url, {
    commentsId: `wpa-${s.id}`, path: s.path, title: s.title, desc: s.desc, author: s.author, sec: s.sec,
    img: s.img, cap: s.cap, date: s.date, html: s.html, gallery: s.gallery,
  });
  if (!page) return res;

  return new Response(request.method === 'HEAD' ? null : page, {
    status: 200,
    headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'public, max-age=600', 'X-Archivo': '1' },
  });
}
