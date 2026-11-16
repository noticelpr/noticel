// Fast publishing (owner, 2026-11-16): a story published in the panel is live in seconds, without waiting for the
// site to rebuild. The "publicar" function saves a copy of each published story in Supabase (table live_stories,
// supabase/rapido.sql). Stories saved AFTER this copy of the site was built (/build.json) are shown from there:
//   - a new story at its address, and an edited one in place of its older built page (functions/_middleware.js);
//   - the newest ones for the home page, the sections and the Última hora bar (/api/recientes).
// Once the next build includes them, the built pages take over again. Lists are kept 10 seconds in Cloudflare's cache.
import categories from '../../src/data/categories.json';
import { storyPage, notFound } from './page.js';

// NotiCel's Supabase: the public address and public key (the same ones the site's pages use, src/lib/backend.ts)
const SB = 'https://tadrjmankkictvqzuibu.supabase.co';
const ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRhZHJqbWFua2tpY3R2cXp1aWJ1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTE0ODU2MDEsImV4cCI6MjEwNzA2MTYwMX0.xzUXK192CWpDDU-OoWh8DEfxiL5vwXYvJ1AJ_JB6BzM';
const KEEP = 10; // seconds a list stays in Cloudflare's cache

let built = 0; // this deployment's build time (constant for the life of this copy)
async function buildTime(env, url) {
  if (built) return built;
  const r = await env.ASSETS.fetch(new URL('/build.json', url)).catch(() => null);
  built = (r?.ok && (await r.json().catch(() => null))?.t) || 1;
  return built;
}

async function cachedJson(key, waitUntil, load) {
  const c = caches.default, req = new Request(key);
  const hit = await c.match(req).catch(() => null);
  if (hit) return hit.json();
  const data = await load();
  if (data) waitUntil(c.put(req, new Response(JSON.stringify(data), { headers: { 'Content-Type': 'application/json', 'Cache-Control': `public, max-age=${KEEP}` } })).catch(() => {}));
  return data;
}
const sb = (q) => fetch(`${SB}/rest/v1/${q}`, { headers: { apikey: ANON, Authorization: `Bearer ${ANON}` } }).then((r) => (r.ok ? r.json() : null)).catch(() => null);

/** Stories published or edited since this copy was built (newest first). */
export async function liveList(env, url, waitUntil) {
  const t = await buildTime(env, url);
  const since = new Date(t).toISOString();
  return (await cachedJson(`https://live.noticel.invalid/list?b=${t}`, waitUntil, () =>
    sb(`live_stories?select=path,slug,title,section,image,breaking,publish_at,deleted,updated_at&updated_at=gt.${encodeURIComponent(since)}&order=publish_at.desc&limit=200`))) ?? [];
}

/** The section's name and address for a category slug. */
export function sectionOf(slug) {
  const c = categories[slug];
  return c ? { name: c.name, url: `/category/${c.path}/` } : { name: 'Noticias', url: '/category/noticias/' };
}

// ---- the story file: front matter (as the panel writes it, src/components/panel/Writer.astro toFile) + Markdown ----
function value(v) {
  const t = v.trim();
  if (!t) return '';
  try { return JSON.parse(t); } catch { return t.replace(/^['"]|['"]$/g, ''); }
}
export function parseFile(file) {
  const m = /^---\n([\s\S]*?)\n---\n?([\s\S]*)$/.exec(file);
  if (!m) return { data: {}, body: file };
  const data = {};
  let list = null, item = null;
  for (const line of m[1].split('\n')) {
    let k;
    if ((k = /^([A-Za-z][\w]*):\s*(.*)$/.exec(line))) { // top-level key
      if (k[2].trim()) { data[k[1]] = value(k[2]); list = null; } else { list = data[k[1]] = []; }
      item = null;
    } else if (list && (k = /^\s+-\s+([A-Za-z]\w*):\s*(.*)$/.exec(line))) { item = { [k[1]]: value(k[2]) }; list.push(item); }
    else if (list && (k = /^\s+-\s+(.*)$/.exec(line))) { item = null; list.push(value(k[1])); }
    else if (item && (k = /^\s+([A-Za-z]\w*):\s*(.*)$/.exec(line))) item[k[1]] = value(k[2]);
  }
  return { data, body: m[2] };
}

// A small Markdown reader for what the panel writes: paragraphs, ## / ### headings, ---, > quotes, lists,
// **bold**, *italics*, [links](…), line breaks, and HTML blocks (photos, videos, documents) passed through as they are
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
function inline(s) {
  const keep = [];
  let t = s.replace(/\\([*_`[\]\\])/g, (_, ch) => `\u0000${keep.push(ch) - 1}\u0000`); // escaped characters
  t = t.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_, txt, href) => `<a href="${href.replace(/"/g, '&quot;')}"${/^https?:/.test(href) ? ' rel="noopener" target="_blank"' : ''}>${txt}</a>`)
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^*])\*([^*]+)\*/g, '$1<em>$2</em>')
    .replace(/ {2}\n/g, '<br>\n');
  return t.replace(/\u0000(\d+)\u0000/g, (_, i) => keep[Number(i)]);
}
export function markdown(body) {
  return body.split(/\n{2,}/).map((b) => b.trim()).filter(Boolean).map((b) => {
    if (b.startsWith('<')) return b;
    if (/^###\s/.test(b)) return `<h3>${inline(b.slice(4))}</h3>`;
    if (/^##\s/.test(b)) return `<h2>${inline(b.slice(3))}</h2>`;
    if (/^-{3,}$/.test(b)) return '<hr>';
    if (/^>\s?/.test(b)) return `<blockquote><p>${inline(b.split('\n').map((l) => l.replace(/^>\s?/, '')).join('\n'))}</p></blockquote>`;
    if (/^(-|\d+\.)\s/.test(b)) {
      const tag = /^\d/.test(b) ? 'ol' : 'ul';
      return `<${tag}>${b.split('\n').map((l) => `<li>${inline(l.replace(/^(-|\d+\.)\s+/, ''))}</li>`).join('')}</${tag}>`;
    }
    if (/^https?:\/\/\S+$/.test(b)) return `<p><a href="${esc(b)}" rel="noopener" target="_blank">${esc(b)}</a></p>`;
    return `<p>${inline(b)}</p>`;
  }).join('\n');
}

/**
 * The page for an address published or edited since the build, or null to let the site answer as usual.
 * Deleted stories answer "not found" at once.
 */
export async function livePage(context) {
  const { request, env, waitUntil } = context;
  if (!['GET', 'HEAD'].includes(request.method)) return null;
  const url = new URL(request.url);
  const path = url.pathname.replace(/%[0-9A-F]{2}/g, (m) => m.toLowerCase()).replace(/\/?$/, '/');
  if (path.split('/').filter(Boolean).length < 2 || /^\/(api|redaccion|_astro|images|fonts|sitemaps)\//.test(path) || /\.[a-z0-9]{2,5}\/$/i.test(path)) return null;
  const list = await liveList(env, url, waitUntil);
  const hit = list.find((s) => s.path === path);
  if (!hit) return null;
  if (hit.deleted) return notFound(env, url);
  if (!url.pathname.endsWith('/')) return Response.redirect(`${url.origin}${url.pathname}/${url.search}`, 301);
  const row = (await cachedJson(`https://live.noticel.invalid/story?p=${encodeURIComponent(path)}&u=${encodeURIComponent(hit.updated_at)}`, waitUntil,
    () => sb(`live_stories?select=slug,file,updated_at&path=eq.${encodeURIComponent(path)}`).then((r) => r?.[0] ?? null))) ?? null;
  if (!row) return null;
  const { data, body } = parseFile(row.file);
  const img = data.image ? (/^https?:\/\//.test(data.image) ? data.image : `/${String(data.image).replace(/^\//, '')}`) : '';
  const page = await storyPage(env, url, {
    commentsId: row.slug, path, title: data.title || hit.title, desc: data.description || '', author: data.author,
    sec: sectionOf((data.categories || [])[0] || hit.section), img, cap: [data.imageCaption, data.imageCredit].filter(Boolean).join(' '),
    date: data.date || hit.publish_at, html: markdown(body), gallery: (data.gallery || []).map((g) => ({ src: g.src, caption: g.caption })),
  });
  if (!page) return null;
  return new Response(request.method === 'HEAD' ? null : page, {
    status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': `public, max-age=${KEEP}`, 'X-Rapido': '1' },
  });
}
