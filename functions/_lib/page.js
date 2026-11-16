// Shared by the archive (functions/[[path]].js) and fast publishing (functions/_lib/live.js): fills the hidden story
// template (/archivo-plantilla/, built from src/content/noticias/zz-archivo-plantilla.md) with one story, so a page
// made on the fly has the same look, ads and comments as a built one.

export const TEMPLATE = '/archivo-plantilla/';
const SENTINEL_DATE = '2001-01-01T00:00:00.000Z';
const DEFAULT_PHOTO = '/images/pr-desde-el-aire-2.jpg';

export const html = (s = '') => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const json = (s = '') => JSON.stringify(String(s)).slice(1, -1).replace(/</g, '\\u003c');
// A summary of about two lines is enough
export const short = (t = '', max = 200) => (t.length <= max ? t : `${t.slice(0, t.lastIndexOf(' ', max) > 120 ? t.lastIndexOf(' ', max) : max).replace(/[\s,;:.]+$/, '')}…`);
const longDate = (d) => d.toLocaleDateString('es-PR', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'America/Puerto_Rico' });

export async function notFound(env, url) {
  const nf = await env.ASSETS.fetch(new URL('/404.html', url));
  return new Response(nf.body, { status: 404, headers: { 'Content-Type': 'text/html; charset=utf-8' } });
}

/**
 * The page for one story. s: { commentsId, path, title, desc, author, sec: { name, url }, img, cap, date (ISO), html, gallery: [{ src, caption }] }.
 * Returns null when the template can't be read.
 */
export async function storyPage(env, url, s) {
  const tplRes = await env.ASSETS.fetch(new URL(TEMPLATE, url));
  if (!tplRes.ok) return null;
  let page = await tplRes.text();
  const date = new Date(s.date);
  const words = (s.html || '').replace(/<[^>]+>/g, ' ').split(/\s+/).filter(Boolean).length;
  const img = s.img || DEFAULT_PHOTO;
  const caption = s.img ? s.cap || 'Imagen de referencia.' : 'Imagen de archivo.';
  const vals = {
    ARCHTITLE0: s.title, ARCHDESC0: short(s.desc || ''), ARCHAUTHOR0: s.author || 'NotiCel', ARCHSECNAME0: s.sec?.name || 'Noticias',
    ARCHSECURL0: s.sec?.url || '/category/noticias/', ARCHCAPTION0: caption, ARCHMIN0: String(Math.max(1, Math.round(words / 200))),
  };
  // Inside the page's structured data (for Google) the values are JSON; everywhere else, HTML text
  const fill = (part, esc) => {
    let out = part;
    for (const [k, v] of Object.entries(vals)) out = out.split(k).join(esc(v));
    return out
      .split('https://archivo.invalid/ARCHIMG0.jpg').join(esc(img))
      .split(SENTINEL_DATE).join(date.toISOString())
      .split(TEMPLATE).join(esc(s.path))
      .split('zz-archivo-plantilla').join(s.commentsId); // the comments belong to this story
  };
  page = page.split(/(<script type="application\/ld\+json">[\s\S]*?<\/script>)/).map((part, i) => fill(part, i % 2 ? json : html)).join('');
  page = page.split(html(longDate(new Date(SENTINEL_DATE)))).join(html(longDate(date)));
  // The story's photo gallery, under the text
  const gallery = (s.gallery || []).filter((g) => g && /^(https:\/\/|\/)/.test(g.src));
  const galleryHtml = gallery.length ? `<section class="arch-gal" aria-label="Galería de fotos"><h2 class="arch-gal-h">Galería de fotos <small>(${gallery.length})</small></h2>${gallery.map((g) => `<figure><img src="${html(g.src)}" alt="${html(g.caption || s.title)}" loading="lazy" decoding="async">${g.caption ? `<figcaption>${html(g.caption)}</figcaption>` : ''}</figure>`).join('')}</section>` : '';
  return page.replace(/<p>ARCHBODY0<\/p>/, () => (s.html || '') + galleryHtml);
}
