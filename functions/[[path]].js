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

const TEMPLATE = '/archivo-plantilla/';
const SENTINEL_DATE = '2001-01-01T00:00:00.000Z';
const DEFAULT_PHOTO = '/images/pr-desde-el-aire-2.jpg';

const html = (s = '') => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const json = (s = '') => JSON.stringify(String(s)).slice(1, -1).replace(/</g, '\\u003c');
// WordPress's automatic summary of older stories is the whole first paragraph: about two lines is enough
const short = (t = '', max = 200) => (t.length <= max ? t : `${t.slice(0, t.lastIndexOf(' ', max) > 120 ? t.lastIndexOf(' ', max) : max).replace(/[\s,;:.]+$/, '')}…`);
const longDate = (d) => d.toLocaleDateString('es-PR', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'America/Puerto_Rico' });

/** The archive file a story lives in (same as scripts/archive-stories.mjs). */
function shardOf(path) {
  let h = 0x811c9dc5;
  for (let i = 0; i < path.length; i++) { h ^= path.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return (h >>> 0).toString(16).padStart(8, '0').slice(0, 3);
}

async function notFound(env, url) {
  const nf = await env.ASSETS.fetch(new URL('/404.html', url));
  return new Response(nf.body, { status: 404, headers: { 'Content-Type': 'text/html; charset=utf-8' } });
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

  const tplRes = await env.ASSETS.fetch(new URL(TEMPLATE, url));
  if (!tplRes.ok) return res;
  let page = await tplRes.text();
  const date = new Date(s.date);
  const words = (s.html || '').replace(/<[^>]+>/g, ' ').split(/\s+/).filter(Boolean).length;
  const minutes = String(Math.max(1, Math.round(words / 200)));
  const img = s.img || DEFAULT_PHOTO;
  const caption = s.img ? s.cap || 'Imagen de referencia.' : 'Imagen de archivo.';
  const vals = {
    ARCHTITLE0: s.title, ARCHDESC0: short(s.desc), ARCHAUTHOR0: s.author || 'NotiCel', ARCHSECNAME0: s.sec?.name || 'Noticias',
    ARCHSECURL0: s.sec?.url || '/category/noticias/', ARCHCAPTION0: caption, ARCHMIN0: minutes,
  };
  // Inside the page's structured data (for Google) the values are JSON; everywhere else, HTML text
  const fill = (part, esc) => {
    let out = part;
    for (const [k, v] of Object.entries(vals)) out = out.split(k).join(esc(v));
    return out
      .split('https://archivo.invalid/ARCHIMG0.jpg').join(esc(img))
      .split(SENTINEL_DATE).join(date.toISOString())
      .split(TEMPLATE).join(esc(s.path))
      .split('zz-archivo-plantilla').join(`wpa-${s.id}`); // the comments belong to this story
  };
  page = page.split(/(<script type="application\/ld\+json">[\s\S]*?<\/script>)/).map((part, i) => fill(part, i % 2 ? json : html)).join('');
  page = page.split(html(longDate(new Date(SENTINEL_DATE)))).join(html(longDate(date)));
  // The story's photo gallery (from noticel.com's database export), under the text
  const gallery = (s.gallery || []).filter((g) => g && /^https:\/\//.test(g.src));
  const galleryHtml = gallery.length ? `<section class="arch-gal" aria-label="Galería de fotos"><h2 class="arch-gal-h">Galería de fotos <small>(${gallery.length})</small></h2>${gallery.map((g) => `<figure><img src="${html(g.src)}" alt="${html(g.caption || s.title)}" loading="lazy" decoding="async">${g.caption ? `<figcaption>${html(g.caption)}</figcaption>` : ''}</figure>`).join('')}</section>` : '';
  page = page.replace(/<p>ARCHBODY0<\/p>/, () => (s.html || '') + galleryHtml);

  return new Response(request.method === 'HEAD' ? null : page, {
    status: 200,
    headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'public, max-age=600', 'X-Archivo': '1' },
  });
}
